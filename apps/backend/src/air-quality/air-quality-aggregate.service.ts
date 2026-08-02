import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AirQualityReadingEntity } from "../database/entities/air-quality-reading.entity";

/**
 * Historical PM2.5 aggregates over our own `air_quality_readings` archive.
 *
 * This is the feature the original spec deferred until "enough data has
 * accumulated": average air quality at a location broken down by hour of
 * day and by day of week — e.g. "у этого ЖК воздух стабильно хуже по
 * будним утрам" — which a single live reading can never tell you.
 *
 * Everything is computed in SQL (one grouped scan per breakdown) so we
 * never pull raw rows into Node. The archive is append-only, so results
 * are cached briefly — the numbers only shift as new snapshots land.
 *
 * Timezone: `recorded_at` carries the upstream's local Almaty timestamp,
 * so EXTRACT(HOUR/DOW) already yields local-time buckets. No shifting.
 */

export interface HourBucket {
  hour: number; // 0..23 local
  avgPm25: number;
  samples: number;
}

export interface WeekdayBucket {
  weekday: number; // 0=Sunday .. 6=Saturday (Postgres DOW)
  avgPm25: number;
  samples: number;
}

export interface ArchiveCoverage {
  totalRows: number;
  stations: number;
  firstReading: string | null;
  lastReading: string | null;
  daysSpanned: number;
  /** True when there's enough history for the breakdowns to mean anything. */
  sufficient: boolean;
}

export interface AggregateResult {
  coverage: ArchiveCoverage;
  /** Null when the location has too few local samples to report. */
  location: {
    lat: number;
    lng: number;
    radiusKm: number;
    samples: number;
    avgPm25: number | null;
    byHour: HourBucket[];
    byWeekday: WeekdayBucket[];
  } | null;
}

/** Below this many samples a bucket is noise, not a pattern. */
const MIN_SAMPLES_PER_BUCKET = 3;
/** Below this many total local samples we refuse to draw any conclusion. */
const MIN_SAMPLES_TOTAL = 24;
/** Enough history for weekday patterns to be meaningful. */
const MIN_DAYS_FOR_SUFFICIENT = 14;
const CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AirQualityAggregateService {
  private readonly logger = new Logger(AirQualityAggregateService.name);
  private coverageCache: { value: ArchiveCoverage; at: number } | null = null;

  constructor(
    @InjectRepository(AirQualityReadingEntity)
    private readingsRepo: Repository<AirQualityReadingEntity>,
  ) {}

  /** How much history we actually hold. Also the honest answer to
   *  "can we ship the by-hour/by-weekday feature yet?". */
  async getCoverage(): Promise<ArchiveCoverage> {
    const now = Date.now();
    if (this.coverageCache && now - this.coverageCache.at < CACHE_TTL_MS) {
      return this.coverageCache.value;
    }
    const row = await this.readingsRepo
      .createQueryBuilder("r")
      .select("COUNT(*)", "total")
      .addSelect("COUNT(DISTINCT r.stationId)", "stations")
      .addSelect("MIN(r.recordedAt)", "first")
      .addSelect("MAX(r.recordedAt)", "last")
      .getRawOne<{ total: string; stations: string; first: Date | null; last: Date | null }>();

    const first = row?.first ? new Date(row.first) : null;
    const last = row?.last ? new Date(row.last) : null;
    const daysSpanned =
      first && last
        ? Math.max(0, Math.round((last.getTime() - first.getTime()) / 86400000))
        : 0;
    const totalRows = parseInt(row?.total || "0", 10);

    const value: ArchiveCoverage = {
      totalRows,
      stations: parseInt(row?.stations || "0", 10),
      firstReading: first ? first.toISOString() : null,
      lastReading: last ? last.toISOString() : null,
      daysSpanned,
      sufficient: totalRows >= 1000 && daysSpanned >= MIN_DAYS_FOR_SUFFICIENT,
    };
    this.coverageCache = { value, at: now };
    return value;
  }

  /**
   * Averages around a point, bucketed by hour-of-day and weekday.
   *
   * Radius filtering uses a bounding box on the indexed lat/lng columns
   * plus an exact haversine — the box lets Postgres skip most rows before
   * doing trig.
   *
   * De-duplication matters more than it looks. The upstream publishes
   * *hourly* values, while we snapshot every 30 min AND on every boot —
   * and on a free-tier host that sleeps, boots cluster around whenever
   * traffic happened to arrive. Averaging raw rows therefore weights each
   * hour by how often we polled it, not by time: one real Thursday
   * afternoon reading could outvote a whole quiet Saturday. So we first
   * collapse to one value per (station, hour), then average those. Every
   * station-hour now counts exactly once, whatever the polling did.
   */
  async getForLocation(
    lat: number,
    lng: number,
    radiusKm = 3,
    days = 90,
  ): Promise<AggregateResult> {
    const coverage = await this.getCoverage();
    if (coverage.totalRows === 0) {
      return { coverage, location: null };
    }

    const radius = Math.min(15, Math.max(0.5, radiusKm));
    const since = new Date(Date.now() - Math.min(365, Math.max(1, days)) * 86400000);

    // Degrees of latitude/longitude covering the radius at this latitude.
    const dLat = radius / 111.32;
    const dLng = radius / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);

    // One row per (station, hour) after the geo/time filter. Parameters are
    // positional so the CTE can be reused verbatim by each aggregate below.
    const dedupedCte = `
      WITH deduped AS (
        SELECT station_id,
               date_trunc('hour', recorded_at) AS h,
               AVG(pm25)::float AS pm25
        FROM air_quality_readings
        WHERE pm25 IS NOT NULL
          AND recorded_at >= $1
          AND lat BETWEEN $2 AND $3
          AND lng BETWEEN $4 AND $5
          AND 6371 * acos(LEAST(1,
                cos(radians($6)) * cos(radians(lat)) *
                cos(radians(lng) - radians($7)) +
                sin(radians($6)) * sin(radians(lat)))) <= $8
        GROUP BY station_id, h
      )`;
    const params = [
      since,
      lat - dLat,
      lat + dLat,
      lng - dLng,
      lng + dLng,
      lat,
      lng,
      radius,
    ];

    const [totalRow] = await this.readingsRepo.query(
      `${dedupedCte}
       SELECT COUNT(*)::int AS samples, AVG(pm25) AS avg FROM deduped`,
      params,
    );

    const samples = Number(totalRow?.samples || 0);
    if (samples < MIN_SAMPLES_TOTAL) {
      return {
        coverage,
        location: {
          lat,
          lng,
          radiusKm: radius,
          samples,
          avgPm25: null,
          byHour: [],
          byWeekday: [],
        },
      };
    }

    const hourRows: Array<{ bucket: string; avg: string; samples: number }> =
      await this.readingsRepo.query(
        `${dedupedCte}
         SELECT EXTRACT(HOUR FROM h) AS bucket, AVG(pm25) AS avg, COUNT(*)::int AS samples
         FROM deduped GROUP BY bucket ORDER BY bucket ASC`,
        params,
      );

    const weekdayRows: Array<{ bucket: string; avg: string; samples: number }> =
      await this.readingsRepo.query(
        `${dedupedCte}
         SELECT EXTRACT(DOW FROM h) AS bucket, AVG(pm25) AS avg, COUNT(*)::int AS samples
         FROM deduped GROUP BY bucket ORDER BY bucket ASC`,
        params,
      );

    const round1 = (v: string | number | null) =>
      v === null ? 0 : Math.round(Number(v) * 10) / 10;

    return {
      coverage,
      location: {
        lat,
        lng,
        radiusKm: radius,
        samples,
        avgPm25: round1(totalRow?.avg ?? null),
        byHour: hourRows
          .filter((r) => Number(r.samples) >= MIN_SAMPLES_PER_BUCKET)
          .map((r) => ({
            hour: Number(r.bucket),
            avgPm25: round1(r.avg),
            samples: Number(r.samples),
          })),
        byWeekday: weekdayRows
          .filter((r) => Number(r.samples) >= MIN_SAMPLES_PER_BUCKET)
          .map((r) => ({
            weekday: Number(r.bucket),
            avgPm25: round1(r.avg),
            samples: Number(r.samples),
          })),
      },
    };
  }
}
