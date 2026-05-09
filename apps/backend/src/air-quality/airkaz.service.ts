import { Injectable, Logger } from "@nestjs/common";

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
const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Aggregates live PM 2.5 readings from api.air.org.kz (Almaty Air Initiative).
 * This API merges multiple sensor networks: AirKaz, IQAir, AirGradient,
 * Clarity, PurpleAir, sensor.community, Reference sites — ~384 stations
 * across Almaty. No API key needed (public Almaty civic project).
 */
@Injectable()
export class AirKazService {
  private readonly logger = new Logger(AirKazService.name);
  private cache: { stations: AirKazStation[]; fetchedAt: number } | null = null;

  /** Get all Almaty stations with live PM 2.5 readings, deduplicated by (lat,lng).
   *  `forceRefresh` bypasses the 15-min in-memory cache (used by the cron
   *  recorder so each scheduled snapshot really hits upstream). */
  async getStations(opts: { forceRefresh?: boolean } = {}): Promise<AirKazStation[]> {
    const now = Date.now();
    if (!opts.forceRefresh && this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.stations;
    }
    try {
      const stations = await this.fetchStations();
      this.cache = { stations, fetchedAt: now };
      this.logger.log(`Fetched ${stations.length} stations from air.org.kz`);
      return stations;
    } catch (err) {
      this.logger.error(`air.org.kz fetch failed: ${err}`);
      return this.cache?.stations || [];
    }
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

  private async fetchStations(): Promise<AirKazStation[]> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(AIR_API_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
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

      // Map and filter to valid Almaty coords + has reading
      const all = raw
        .filter(
          (s) =>
            typeof s.lat === "number" &&
            typeof s.lon === "number" &&
            s.lat >= 43.0 &&
            s.lat <= 43.5 &&
            s.lon >= 76.4 &&
            s.lon <= 77.5 &&
            s.pm25 !== null &&
            !isNaN(s.pm25 as number),
        )
        .map(
          (s): AirKazStation => ({
            id: String(s.id),
            name: (s.name || "").trim(),
            lat: s.lat,
            lng: s.lon,
            pm25: s.pm25,
            pm10: null,
            aqi: null,
            temp: null,
            humid: null,
            status: "active",
            date: s.datetime || s.created_at || "",
            district: s.district || null,
            origin: s.origin || "Unknown",
          }),
        );

      // Deduplicate by rounded coordinate (multiple sensors at exact same spot
      // produce overlapping markers in heatmap). Keep latest.
      const seen = new Map<string, AirKazStation>();
      for (const s of all) {
        const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
        const prev = seen.get(key);
        if (!prev) {
          seen.set(key, s);
        } else {
          // prefer entry with more recent date
          if ((s.date || "") > (prev.date || "")) seen.set(key, s);
        }
      }
      return Array.from(seen.values());
    } finally {
      clearTimeout(timeout);
    }
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
