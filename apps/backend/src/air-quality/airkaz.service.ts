import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AirQualityReadingEntity } from "../database/entities/air-quality-reading.entity";

export interface AirKazStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  pm25: number | null;
  pm10: number | null;
  aqi: number | null;
  temp: number | null;
  humid: number | null;
  status: string;
  date: string;
  district: string | null;
  origin: string;
}

export interface AirQualityResult {
  pm25: number;
  level: AirQualityLevel;
  levelLabel: string;
  color: string;
  station: string;
  distanceMeters: number;
  updatedAt: Date;
}

export type AirQualityLevel =
  | "good"
  | "moderate"
  | "sensitive"
  | "unhealthy"
  | "very_unhealthy"
  | "hazardous";

const AIR_API_URL = "https://api.air.org.kz/api/pm25/hourly/latest";
const AIRKAZ_HTML_URL = "https://airkaz.org/";
const SENSOR_COMMUNITY_URL = "https://data.sensor.community/static/v2/data.json";
const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** Almaty bounding box — shared by every source's coordinate filter. */
const BOUNDS = { minLat: 43.0, maxLat: 43.5, minLng: 76.4, maxLng: 77.5 };
/** Physically plausible PM2.5 window. Community sensors regularly emit
 *  0.02 (dead/indoor unit) or 3000+ (fault) — both poison the heatmap. */
const PM25_MIN = 0.5;
const PM25_MAX = 1000;
/** A source reading is only "live" if its own timestamp is this fresh. */
const LIVE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** When every upstream is down we replay the newest archived snapshot,
 *  but only if it isn't hopelessly old. */
const DB_FALLBACK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Which source actually produced the current station list. */
export type AirSource =
  | "air.org.kz"
  | "airkaz.org"
  | "sensor.community"
  | "archive"
  | "none";

export interface AirStationsResult {
  stations: AirKazStation[];
  source: AirSource;
  /** True when served from our archive because all upstreams failed. */
  stale: boolean;
  /** Timestamp of the freshest reading in the set, if known. */
  asOf: string | null;
}

/**
 * Aggregates live PM 2.5 readings from api.air.org.kz (Almaty Air Initiative).
 * This API merges multiple sensor networks: AirKaz, IQAir, AirGradient,
 * Clarity, PurpleAir, sensor.community, Reference sites — ~384 stations
 * across Almaty. No API key needed (public Almaty civic project).
 */
@Injectable()
export class AirKazService {
  private readonly logger = new Logger(AirKazService.name);
  private cache: { result: AirStationsResult; fetchedAt: number } | null = null;

  constructor(
    @InjectRepository(AirQualityReadingEntity)
    private readingsRepo: Repository<AirQualityReadingEntity>,
  ) {}

  /** Get all Almaty stations with live PM 2.5 readings, deduplicated by (lat,lng).
   *  `forceRefresh` bypasses the 15-min in-memory cache (used by the cron
   *  recorder so each scheduled snapshot really hits upstream). */
  async getStations(opts: { forceRefresh?: boolean } = {}): Promise<AirKazStation[]> {
    return (await this.getStationsDetailed(opts)).stations;
  }

  /**
   * Same as getStations but reports which source answered and whether the
   * data is a replayed archive snapshot. Callers that surface data to users
   * (map, complex card) should show the staleness.
   *
   * Source chain — first non-empty wins:
   *   1. api.air.org.kz — the AAI aggregator (~380 stations, 7 networks)
   *   2. airkaz.org     — inline sensors_data on the public page
   *   3. sensor.community — open global feed, a handful of Almaty units
   *   4. our own archive — last known good snapshot (marked stale)
   *
   * `allowArchiveFallback: false` is used by the cron recorder: replaying
   * archived rows back into the archive would duplicate history.
   */
  async getStationsDetailed(
    opts: { forceRefresh?: boolean; allowArchiveFallback?: boolean } = {},
  ): Promise<AirStationsResult> {
    const allowArchive = opts.allowArchiveFallback !== false;
    const now = Date.now();
    if (!opts.forceRefresh && this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.result;
    }

    const sources: Array<[AirSource, () => Promise<AirKazStation[]>]> = [
      ["air.org.kz", () => this.fetchFromAirOrgKz()],
      ["airkaz.org", () => this.fetchFromAirkazOrg()],
      ["sensor.community", () => this.fetchFromSensorCommunity()],
    ];

    for (const [source, fetcher] of sources) {
      try {
        const stations = this.dedupe(await fetcher());
        if (stations.length > 0) {
          const result: AirStationsResult = {
            stations,
            source,
            stale: false,
            asOf: this.newestDate(stations),
          };
          this.cache = { result, fetchedAt: now };
          this.logger.log(`Fetched ${stations.length} stations from ${source}`);
          return result;
        }
        this.logger.warn(`${source} returned 0 usable stations`);
      } catch (err) {
        this.logger.warn(`${source} fetch failed: ${err}`);
      }
    }

    // Every upstream is down. Prefer a warm in-memory copy, else replay the
    // newest archived snapshot so the map isn't blank.
    if (this.cache && this.cache.result.stations.length > 0) {
      this.logger.warn("All AQ upstreams failed — serving in-memory cache");
      return { ...this.cache.result, stale: true };
    }
    if (allowArchive) {
      const archived = await this.loadArchivedSnapshot();
      if (archived.stations.length > 0) {
        this.logger.warn(
          `All AQ upstreams failed — replaying archive snapshot (${archived.stations.length} stations, asOf ${archived.asOf})`,
        );
        this.cache = { result: archived, fetchedAt: now };
        return archived;
      }
    }

    this.logger.error("All AQ sources failed and archive is empty");
    return { stations: [], source: "none", stale: true, asOf: null };
  }

  /**
   * Newest reading per station from our own archive. Used only when all
   * upstreams are unreachable — better a labelled "данные от <дата>" map
   * than an empty one.
   */
  private async loadArchivedSnapshot(): Promise<AirStationsResult> {
    try {
      const rows = await this.readingsRepo
        .createQueryBuilder("r")
        .distinctOn(["r.stationId"])
        .where("r.pm25 IS NOT NULL")
        .orderBy("r.stationId")
        .addOrderBy("r.recordedAt", "DESC")
        .limit(1000)
        .getMany();
      if (rows.length === 0) {
        return { stations: [], source: "none", stale: true, asOf: null };
      }

      const newestMs = Math.max(
        ...rows.map((r) => new Date(r.recordedAt).getTime()),
      );
      if (Date.now() - newestMs > DB_FALLBACK_MAX_AGE_MS) {
        this.logger.warn(
          `Archive snapshot is older than ${DB_FALLBACK_MAX_AGE_MS / 86400000}d — not replaying`,
        );
        return { stations: [], source: "none", stale: true, asOf: null };
      }

      // Only keep stations belonging to that latest snapshot window, so a
      // sensor that died months ago doesn't linger on the map.
      const windowStart = newestMs - 3 * 60 * 60 * 1000;
      const stations = rows
        .filter((r) => new Date(r.recordedAt).getTime() >= windowStart)
        .map(
          (r): AirKazStation => ({
            id: String(r.stationId),
            name: r.name,
            lat: Number(r.lat),
            lng: Number(r.lng),
            pm25: r.pm25 === null ? null : Number(r.pm25),
            pm10: null,
            aqi: null,
            temp: null,
            humid: null,
            status: "archived",
            date: new Date(r.recordedAt).toISOString(),
            district: r.district || null,
            origin: r.origin || "archive",
          }),
        );

      return {
        stations: this.dedupe(stations),
        source: "archive",
        stale: true,
        asOf: new Date(newestMs).toISOString(),
      };
    } catch (err) {
      this.logger.error(`Archive fallback failed: ${err}`);
      return { stations: [], source: "none", stale: true, asOf: null };
    }
  }

  /** Deduplicate by rounded coordinate, keeping the most recent reading —
   *  multiple units at one address otherwise stack into one blob marker. */
  private dedupe(all: AirKazStation[]): AirKazStation[] {
    const seen = new Map<string, AirKazStation>();
    for (const s of all) {
      const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
      const prev = seen.get(key);
      if (!prev || (s.date || "") > (prev.date || "")) seen.set(key, s);
    }
    return Array.from(seen.values());
  }

  private newestDate(stations: AirKazStation[]): string | null {
    let best: string | null = null;
    for (const s of stations) if (s.date && (!best || s.date > best)) best = s.date;
    return best;
  }

  /** Shared validity gate: inside Almaty, plausible PM2.5, fresh enough. */
  private isUsable(lat: number, lng: number, pm25: number | null, date: string): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat) return false;
    if (lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return false;
    if (pm25 === null || !Number.isFinite(pm25)) return false;
    if (pm25 < PM25_MIN || pm25 > PM25_MAX) return false;
    if (date) {
      const t = new Date(date.includes("T") ? date : date.replace(" ", "T")).getTime();
      if (Number.isFinite(t) && Date.now() - t > LIVE_MAX_AGE_MS) return false;
    }
    return true;
  }

  /** Find nearest station with live PM 2.5 data for a given coordinate. */
  async getNearestAirQuality(
    lat: number,
    lng: number,
  ): Promise<AirQualityResult | null> {
    const stations = await this.getStations();
    if (stations.length === 0) return null;

    let nearest: AirKazStation | null = null;
    let nearestDist = Infinity;
    for (const s of stations) {
      if (s.pm25 === null) continue;
      const d = this.haversineMeters(lat, lng, s.lat, s.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }
    if (!nearest) return null;

    const pm25 = nearest.pm25!;
    const { level, label, color } = this.classifyPm25(pm25);

    return {
      pm25,
      level,
      levelLabel: label,
      color,
      station: nearest.name,
      distanceMeters: Math.round(nearestDist),
      updatedAt: new Date(nearest.date),
    };
  }

  /** Shared fetch with timeout + browser-ish headers. */
  private async httpGet(url: string, accept = "application/json"): Promise<Response> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: accept,
        },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fallback B — sensor.community open feed (whole world, last ~5 min).
   * Only a handful of Almaty units, but they're genuinely live and need
   * no key. `P2` is the feed's PM2.5 value type.
   */
  private async fetchFromSensorCommunity(): Promise<AirKazStation[]> {
    const res = await this.httpGet(SENSOR_COMMUNITY_URL);
    if (!res.ok) throw new Error(`sensor.community HTTP ${res.status}`);
    const raw = (await res.json()) as Array<any>;
    const out: AirKazStation[] = [];
    for (const r of raw) {
      const loc = r?.location || {};
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat) continue;
      if (lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
      const p2 = (r?.sensordatavalues || []).find(
        (v: any) => v?.value_type === "P2",
      );
      if (!p2) continue;
      const pm25 = Number(p2.value);
      const date = String(r?.timestamp || "");
      if (!this.isUsable(lat, lng, pm25, date)) continue;
      out.push({
        id: `sc-${r.sensor?.id ?? r.id}`,
        name: `Сенсор ${loc.id ?? r.sensor?.id ?? ""}`.trim(),
        lat,
        lng,
        pm25,
        pm10: null,
        aqi: null,
        temp: null,
        humid: null,
        status: "active",
        date,
        district: null,
        origin: "sensor.community",
      });
    }
    return out;
  }

  /**
   * Fallback A — airkaz.org embeds its station table as a `sensors_data`
   * JS array in the page. Values arrive as strings and many units are long
   * dead (status "active" but a 2021 timestamp), so isUsable() does the
   * heavy lifting here.
   */
  private async fetchFromAirkazOrg(): Promise<AirKazStation[]> {
    const res = await this.httpGet(AIRKAZ_HTML_URL, "text/html");
    if (!res.ok) throw new Error(`airkaz.org HTTP ${res.status}`);
    const html = await res.text();

    const marker = html.indexOf("sensors_data");
    if (marker === -1) throw new Error("airkaz.org: sensors_data not found");
    const start = html.indexOf("[", marker);
    if (start === -1) throw new Error("airkaz.org: array start not found");
    let depth = 0;
    let end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) throw new Error("airkaz.org: unterminated array");
    const raw = JSON.parse(html.slice(start, end)) as Array<any>;

    const out: AirKazStation[] = [];
    for (const s of raw) {
      if (String(s?.city || "").trim() !== "Алматы") continue;
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      const pm25 = s.pm25 === null || s.pm25 === "" ? null : Number(s.pm25);
      const date = String(s.date || "");
      if (!this.isUsable(lat, lng, pm25, date)) continue;
      out.push({
        id: String(s.id),
        name: String(s.name || "").trim() || `Station ${s.id}`,
        lat,
        lng,
        pm25,
        pm10: s.pm10 == null ? null : Number(s.pm10),
        aqi: s.AQI == null ? null : Number(s.AQI),
        temp: s.temp == null ? null : Number(s.temp),
        humid: s.humid == null ? null : Number(s.humid),
        status: String(s.status || "active"),
        date,
        district: null,
        origin: "AirKaz",
      });
    }
    return out;
  }

  /** Primary — the AAI aggregator merging ~7 sensor networks. */
  private async fetchFromAirOrgKz(): Promise<AirKazStation[]> {
    const res = await this.httpGet(AIR_API_URL);
    if (!res.ok) throw new Error(`air.org.kz HTTP ${res.status}`);
    const raw = (await res.json()) as Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      pm25: number | null;
      district?: string | null;
      origin?: string;
      datetime?: string;
      created_at?: string;
    }>;

    const out: AirKazStation[] = [];
    for (const s of raw) {
      const lat = Number(s.lat);
      const lng = Number(s.lon);
      const pm25 = s.pm25 === null ? null : Number(s.pm25);
      const date = s.datetime || s.created_at || "";
      // This aggregator is already QA'd upstream, so we only apply the
      // geo/plausibility gate — not the freshness one, since its hourly
      // rollups can legitimately lag behind the wall clock.
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat) continue;
      if (lng < BOUNDS.minLng || lng > BOUNDS.maxLng) continue;
      if (pm25 === null || !Number.isFinite(pm25)) continue;
      if (pm25 < 0 || pm25 > PM25_MAX) continue;
      out.push({
        id: String(s.id),
        name: (s.name || "").trim(),
        lat,
        lng,
        pm25,
        pm10: null,
        aqi: null,
        temp: null,
        humid: null,
        status: "active",
        date,
        district: s.district || null,
        origin: s.origin || "Unknown",
      });
    }
    return out;
  }

  /**
   * PM 2.5 categories calibrated to Kazakhstan's local sanitary norm
   * (СанПиН РК — daily-average ПДК = 35 µg/m³). Lower bands match local
   * intuition ("ниже ПДК = хорошо"); upper bands keep US EPA breakpoints
   * since those describe genuinely dangerous concentrations regardless of
   * jurisdiction.
   *
   * The slide-over carries a WHO disclaimer noting that WHO 2021 considers
   * anything above 15 µg/m³ already non-ideal — for users who want the
   * strictest reading.
   *
   * Almaty winter values regularly exceed 100 µg/m³.
   */
  classifyPm25(pm25: number): {
    level: AirQualityLevel;
    label: string;
    color: string;
  } {
    if (pm25 < 35) return { level: "good", label: "Хорошее", color: "#22c55e" };
    if (pm25 < 55)
      return { level: "moderate", label: "Умеренное", color: "#eab308" };
    if (pm25 < 125)
      return {
        level: "sensitive",
        label: "Вредное для чувствительных",
        color: "#f97316",
      };
    if (pm25 < 225)
      return { level: "unhealthy", label: "Вредное", color: "#dc2626" };
    if (pm25 < 325)
      return {
        level: "very_unhealthy",
        label: "Очень вредное",
        color: "#9f1239",
      };
    return { level: "hazardous", label: "Опасное", color: "#7c2d12" };
  }

  private haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
