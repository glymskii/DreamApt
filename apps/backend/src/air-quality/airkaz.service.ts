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
  date: string; // last reading timestamp
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

const AIRKAZ_URL = "https://airkaz.org";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Parses live PM 2.5 sensor data from airkaz.org.
 * Data is embedded in the homepage HTML as `var sensors_data = [...]`.
 * No API key required — public sensor network for Almaty.
 */
@Injectable()
export class AirKazService {
  private readonly logger = new Logger(AirKazService.name);
  private cache: { stations: AirKazStation[]; fetchedAt: number } | null = null;

  /** Get all Almaty stations with live PM 2.5 readings */
  async getStations(): Promise<AirKazStation[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.stations;
    }
    try {
      const stations = await this.fetchStations();
      this.cache = { stations, fetchedAt: now };
      this.logger.log(`Fetched ${stations.length} Almaty stations from airkaz.org`);
      return stations;
    } catch (err) {
      this.logger.error(`AirKaz fetch failed: ${err}`);
      // Return stale cache on error if we have one
      return this.cache?.stations || [];
    }
  }

  /** Find nearest station with live PM 2.5 data and return AQ result */
  async getNearestAirQuality(
    lat: number,
    lng: number,
  ): Promise<AirQualityResult | null> {
    const stations = await this.getStations();
    const candidates = stations.filter(
      (s) => s.pm25 !== null && s.status === "active",
    );
    if (candidates.length === 0) return null;

    let nearest: AirKazStation | null = null;
    let nearestDist = Infinity;
    for (const s of candidates) {
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
      const res = await fetch(AIRKAZ_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AirKaz HTTP ${res.status}`);
      const html = await res.text();

      const idx = html.indexOf("var sensors_data");
      if (idx < 0) throw new Error("sensors_data block not found");
      const start = html.indexOf("[", idx);
      let depth = 0;
      let end = start;
      for (let i = start; i < html.length; i++) {
        if (html[i] === "[") depth++;
        if (html[i] === "]") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      const jsonStr = html.slice(start, end);
      const raw = JSON.parse(jsonStr) as Array<Record<string, any>>;

      return raw
        .filter((s) => s.city === "Алматы")
        .map((s) => ({
          id: String(s.id),
          name: String(s.name || "").trim(),
          lat: parseFloat(s.lat),
          lng: parseFloat(s.lng),
          pm25: s.pm25 != null ? parseFloat(s.pm25) : null,
          pm10: s.pm10 != null ? parseFloat(s.pm10) : null,
          aqi: s.AQI != null ? parseFloat(s.AQI) : null,
          temp: s.temp != null ? parseFloat(s.temp) : null,
          humid: s.humid != null ? parseFloat(s.humid) : null,
          status: s.status || "unknown",
          date: s.date || "",
        }))
        .filter((s) => !isNaN(s.lat) && !isNaN(s.lng));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * US EPA PM 2.5 categories (annual standards).
   * In Almaty winter values regularly exceed 100 µg/m³.
   */
  classifyPm25(pm25: number): {
    level: AirQualityLevel;
    label: string;
    color: string;
  } {
    if (pm25 < 12) return { level: "good", label: "Хорошее", color: "#22c55e" };
    if (pm25 < 35.5)
      return { level: "moderate", label: "Умеренное", color: "#eab308" };
    if (pm25 < 55.5)
      return {
        level: "sensitive",
        label: "Вредное для чувствительных",
        color: "#f97316",
      };
    if (pm25 < 150.5)
      return { level: "unhealthy", label: "Вредное", color: "#dc2626" };
    if (pm25 < 250.5)
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
