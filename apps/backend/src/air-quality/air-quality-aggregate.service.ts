import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AirQualityDailyEntity } from "../database/entities/air-quality-daily.entity";

/**
 * Historical PM2.5 aggregates over the long-term archive `air_quality_daily`
 * (one row per station per Almaty day, 24 hourly means — see
 * AirQualityArchiveService for how it's filled: Almaty Air Initiative's
 * open dataset plus our own rolled-up live snapshots).
 *
 * Average air quality at a location broken down by hour of day and by day
 * of week — e.g. "у этого ЖК воздух стабильно хуже по будним утрам" — which
 * a single live reading can never tell you. With a year of history the
 * numbers are stable instead of reflecting whichever weeks we happened to
 * record.
 *
 * Every station-hour counts exactly once: the archive already holds one
 * value per (station, hour). Everything is computed in SQL; results are
 * cached briefly.
 *
 * Timezone: buckets are Almaty wall-clock hours.
 */

export const ALMATY_TZ = "Asia/Almaty";

/**
 * Almaty wall-clock time of a raw `air_quality_readings` row, as a SQL
 * expression (used when rolling raw snapshots up into the archive).
 *
 * `recorded_at` (timestamp without time zone) holds the upstream's own
 * timestamp in one of two conventions. Rows written before the October 2026
 * timestamp normalisation may carry a source's naive local time; since then
 * every source is normalised to UTC and the server runs in UTC. A reading is
 * at most 6 h old when stored (AirKazService's freshness gate), so a
 * `recorded_at` more than 2 h *ahead* of the insert time can only be local.
 */
export const LOCAL_TIME_SQL = `(CASE
  WHEN recorded_at > ((created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC') + interval '2 hours'
    THEN recorded_at
  ELSE (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE '${ALMATY_TZ}'
END)`;

/** First Almaty day of an N-day window ending today, as SQL on `$n`. */
const sinceDaySql = (param: string) =>
  `((now() AT TIME ZONE '${ALMATY_TZ}')::date - (${param}::int - 1))`;

/** Every archived station-hour as (station_id, day, hour, pm25). */
const UNNEST_SQL = `
  CROSS JOIN LATERAL unnest(d.pm25) WITH ORDINALITY AS x(v, i)`;

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
  /** Station-hours held. */
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

export interface DailyProfileStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  origin: string | null;
  /** Mean PM2.5 at each local hour 0..23; null when never measured then. */
  pm25: (number | null)[];
}

/** A typical day: what each sensor usually shows at each hour. */
export interface DailyProfile {
  timezone: string;
  /** Window asked for, in days. */
  days: number;
  /** Local days in the window when at least CITYWIDE_STATIONS sensors
   *  reported; days with any reading if there was no such day. */
  daysCovered: number;
  /** First and last local day with data, YYYY-MM-DD. */
  firstDay: string | null;
  lastDay: string | null;
  /** City-wide mean per hour; every station counts once. */
  hours: Array<{ hour: number; avgPm25: number | null; stations: number }>;
  stations: DailyProfileStation[];
}

/** Below this many samples a bucket is noise, not a pattern. */
const MIN_SAMPLES_PER_BUCKET = 3;
/** Below this many total local samples we refuse to draw any conclusion. */
const MIN_SAMPLES_TOTAL = 24;
/** Enough history for weekday patterns to be meaningful. */
const MIN_DAYS_FOR_SUFFICIENT = 14;
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Longest window any breakdown accepts. */
export const MAX_WINDOW_DAYS = 400;
/** Sensors reporting on a day for it to count as a citywide picture; the
 *  map draws its interpolated field from the same number. */
const CITYWIDE_STATIONS = 10;

@Injectable()
export class AirQualityAggregateService {
  private readonly logger = new Logger(AirQualityAggregateService.name);
  private coverageCache: { value: ArchiveCoverage; at: number } | null = null;
  private profileCache = new Map<number, { value: DailyProfile; at: number }>();

  constructor(
    @InjectRepository(AirQualityDailyEntity)
    private dailyRepo: Repository<AirQualityDailyEntity>,
  ) {}

  /** How much history we actually hold. Also the honest answer to
   *  "can we ship the by-hour/by-weekday feature yet?". */
  async getCoverage(): Promise<ArchiveCoverage> {
    const now = Date.now();
    if (this.coverageCache && now - this.coverageCache.at < CACHE_TTL_MS) {
      return this.coverageCache.value;
    }
    const [row] = await this.dailyRepo.query(
      `SELECT COALESCE(SUM(hours), 0)::bigint AS total,
              COUNT(DISTINCT station_id)::int AS stations,
              to_char(MIN(day), 'YYYY-MM-DD') AS first,
              to_char(MAX(day), 'YYYY-MM-DD') AS last
       FROM air_quality_daily WHERE hours > 0`,
    );

    // Days are Almaty dates; report them as the instant the day starts.
    const iso = (day: string | null) => (day ? new Date(`${day}T00:00:00+05:00`).toISOString() : null);
    const first = iso(row?.first ?? null);
    const last = iso(row?.last ?? null);
    const daysSpanned =
      first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 86400000) : 0;
    const totalRows = Number(row?.total || 0);

    const value: ArchiveCoverage = {
      totalRows,
      stations: Number(row?.stations || 0),
      firstReading: first,
      lastReading: last,
      daysSpanned,
      sufficient: totalRows >= 1000 && daysSpanned >= MIN_DAYS_FOR_SUFFICIENT,
    };
    this.coverageCache = { value, at: now };
    return value;
  }

  /**
   * Averages around a point, bucketed by hour-of-day and weekday, over the
   * last `days` Almaty days.
   *
   * Stations are picked by a bounding box plus an exact haversine on the
   * small stations table; only their archive rows are unnested.
   */
  async getForLocation(
    lat: number,
    lng: number,
    radiusKm = 3,
    days = 365,
  ): Promise<AggregateResult> {
    const coverage = await this.getCoverage();
    if (coverage.totalRows === 0) {
      return { coverage, location: null };
    }

    const radius = Math.min(15, Math.max(0.5, radiusKm));
    const window = Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.round(days)));

    // Degrees of latitude/longitude covering the radius at this latitude.
    const dLat = radius / 111.32;
    const dLng = radius / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);

    const hoursCte = `
      WITH st AS (
        SELECT station_id FROM air_quality_stations
        WHERE lat BETWEEN $2 AND $3
          AND lng BETWEEN $4 AND $5
          AND 6371 * acos(LEAST(1,
                cos(radians($6)) * cos(radians(lat)) *
                cos(radians(lng) - radians($7)) +
                sin(radians($6)) * sin(radians(lat)))) <= $8
      ),
      hours AS (
        SELECT d.day, (x.i - 1)::int AS hour, x.v::float AS pm25
        FROM air_quality_daily d
        JOIN st ON st.station_id = d.station_id
        ${UNNEST_SQL}
        WHERE d.day >= ${sinceDaySql("$1")} AND x.v IS NOT NULL
      )`;
    const params = [window, lat - dLat, lat + dLat, lng - dLng, lng + dLng, lat, lng, radius];

    const [totalRow] = await this.dailyRepo.query(
      `${hoursCte}
       SELECT COUNT(*)::int AS samples, AVG(pm25) AS avg FROM hours`,
      params,
    );

    const samples = Number(totalRow?.samples || 0);
    if (samples < MIN_SAMPLES_TOTAL) {
      return {
        coverage,
        location: { lat, lng, radiusKm: radius, samples, avgPm25: null, byHour: [], byWeekday: [] },
      };
    }

    const hourRows: Array<{ bucket: string; avg: string; samples: number }> =
      await this.dailyRepo.query(
        `${hoursCte}
         SELECT hour AS bucket, AVG(pm25) AS avg, COUNT(*)::int AS samples
         FROM hours GROUP BY bucket ORDER BY bucket ASC`,
        params,
      );

    const weekdayRows: Array<{ bucket: string; avg: string; samples: number }> =
      await this.dailyRepo.query(
        `${hoursCte}
         SELECT EXTRACT(DOW FROM day)::int AS bucket, AVG(pm25) AS avg, COUNT(*)::int AS samples
         FROM hours GROUP BY bucket ORDER BY bucket ASC`,
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
          .map((r) => ({ hour: Number(r.bucket), avgPm25: round1(r.avg), samples: Number(r.samples) })),
        byWeekday: weekdayRows
          .filter((r) => Number(r.samples) >= MIN_SAMPLES_PER_BUCKET)
          .map((r) => ({ weekday: Number(r.bucket), avgPm25: round1(r.avg), samples: Number(r.samples) })),
      },
    };
  }

  /**
   * Typical day for the map's time-of-day slider: each sensor's mean PM2.5
   * at every local hour over the last `days` Almaty days. Co-located units
   * are merged like the live map does.
   */
  async getDailyProfile(days = 365): Promise<DailyProfile> {
    const window = Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.round(days)));
    const now = Date.now();
    const cached = this.profileCache.get(window);
    if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

    const cells: Array<{ stationId: string; hour: number; avg: number }> =
      await this.dailyRepo.query(
        `SELECT d.station_id AS "stationId", (x.i - 1)::int AS hour, AVG(x.v)::float AS avg
         FROM air_quality_daily d
         ${UNNEST_SQL}
         WHERE d.day >= ${sinceDaySql("$1")} AND x.v IS NOT NULL
         GROUP BY d.station_id, x.i`,
        [window],
      );

    // A day the whole city was measured, not just a fallback trickle: what
    // «среднее за N дней» honestly means while a big feed is still new.
    const [span]: Array<{ citywide: number; days: number; first: string | null; last: string | null }> =
      await this.dailyRepo.query(
        `WITH daily AS (
           SELECT day AS d, COUNT(*) AS stations FROM air_quality_daily
           WHERE day >= ${sinceDaySql("$1")} AND hours > 0 GROUP BY day
         )
         SELECT COUNT(*) FILTER (WHERE stations >= $2)::int AS citywide,
                COUNT(*)::int AS days,
                to_char(MIN(d), 'YYYY-MM-DD') AS first,
                to_char(MAX(d), 'YYYY-MM-DD') AS last
         FROM daily`,
        [window, CITYWIDE_STATIONS],
      );

    // Newest name and position of each station that reported in the window.
    const meta: Array<{ stationId: string; name: string; lat: number; lng: number; origin: string | null }> =
      await this.dailyRepo.query(
        `SELECT s.station_id AS "stationId", s.name, s.lat, s.lng, s.origin
         FROM air_quality_stations s
         WHERE EXISTS (
           SELECT 1 FROM air_quality_daily d
           WHERE d.station_id = s.station_id AND d.day >= ${sinceDaySql("$1")} AND d.hours > 0
         )
         ORDER BY s.station_id`,
        [window],
      );

    const byStation = new Map<string, number[][]>();
    for (const c of cells) {
      let hours = byStation.get(c.stationId);
      if (!hours) byStation.set(c.stationId, (hours = Array.from({ length: 24 }, () => [])));
      hours[Number(c.hour)].push(Number(c.avg));
    }

    // Several units at one address show up as one marker; average them.
    const byPlace = new Map<string, { station: (typeof meta)[number]; hours: number[][] }>();
    for (const m of meta) {
      const hours = byStation.get(m.stationId);
      if (!hours) continue;
      const key = `${Number(m.lat).toFixed(4)},${Number(m.lng).toFixed(4)}`;
      const place = byPlace.get(key);
      if (!place) byPlace.set(key, { station: m, hours });
      else hours.forEach((values, h) => place.hours[h].push(...values));
    }

    const mean = (values: number[]) =>
      values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
    const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

    const stations: DailyProfileStation[] = [...byPlace.values()].map(({ station, hours }) => ({
      id: String(station.stationId),
      name: station.name,
      lat: Number(station.lat),
      lng: Number(station.lng),
      origin: station.origin || null,
      pm25: hours.map((values) => round1(mean(values))),
    }));

    const hours = Array.from({ length: 24 }, (_, hour) => {
      const values = stations
        .map((s) => s.pm25[hour])
        .filter((v): v is number => v !== null);
      return { hour, avgPm25: round1(mean(values)), stations: values.length };
    });

    const value: DailyProfile = {
      timezone: ALMATY_TZ,
      days: window,
      daysCovered: Number(span?.citywide || span?.days || 0),
      firstDay: span?.first ?? null,
      lastDay: span?.last ?? null,
      hours,
      stations,
    };
    this.profileCache.set(window, { value, at: now });
    return value;
  }
}
