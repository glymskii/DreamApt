/**
 * Parsing and cleaning of the Almaty Air Initiative open dataset
 * (github.com/Almaty-Air-Initiative/kz-open-air-quality-data, open_sensors/).
 *
 * Pure functions only — no DB, no network — so the cleaning rules can be
 * tested on hand-written series. AirQualityArchiveService does the I/O.
 *
 * The monthly files hold one row per sensor per hour, Almaty local time
 * (UTC+5). Their column set changes between years, so columns are looked
 * up by header name, never by position.
 */

/** Same box the live feeds are filtered with (AirKazService.BOUNDS). */
const BOUNDS = { minLat: 43.0, maxLat: 43.5, minLng: 76.4, maxLng: 77.5 };
const PM25_MAX = 1000;
/** Identical readings this many hours in a row: the sensor is stuck. */
export const STUCK_RUN_HOURS = 24;
/** Neighbours on each side a reading is compared with for spikes. */
const SPIKE_WINDOW = 3;

export interface AaiReading {
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  origin: string;
  district: string | null;
  /** Almaty local day, YYYY-MM-DD. */
  day: string;
  /** Almaty local hour, 0..23. */
  hour: number;
  pm25: number;
}

export interface StationMeta {
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  origin: string;
  district: string | null;
}

export interface DailyRow {
  stationId: string;
  day: string;
  /** 24 values, index = local hour; null where nothing usable was measured. */
  pm25: (number | null)[];
  hours: number;
}

export interface CleaningStats {
  /** Data rows read from the file. */
  rows: number;
  /** Rows the dataset itself marks invalid (mirrors, broken units). */
  invalid: number;
  /** No PM2.5, outside Almaty, or physically implausible. */
  unusable: number;
  stuck: number;
  spikes: number;
  /** Station-hours kept after cleaning. */
  kept: number;
}

/** One CSV line → fields. Handles quotes, commas in quotes and "" escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Our station id for a dataset row. AirGradient ids are the same
 * locationIds the live AirGradient feed reports (`ag-…`), and AirKaz ids
 * are airkaz.org's own, so archive and live history land on one station.
 */
export function stationIdFor(source: string, id: string): string {
  const src = source.trim().toLowerCase();
  if (src === "airgradient") return `ag-${id}`;
  if (src === "airkaz") return id;
  if (src === "iqair") return `iq-${id}`;
  return `${src || "aai"}-${id}`;
}

const ORIGINS: Record<string, string> = {
  airgradient: "AirGradient",
  airkaz: "AirKaz",
  iqair: "IQAir",
};

/**
 * Turns a header row into a row parser. Rows the dataset marks invalid,
 * without PM2.5, outside Almaty or out of physical range come back as a
 * reason string instead of a reading.
 */
export function makeRowParser(header: string[]) {
  const col = new Map(header.map((h, i) => [h.trim().replace(/^﻿/, ""), i]));
  for (const required of ["source", "id", "datetime", "pm25", "lat", "lon", "is_valid"]) {
    if (!col.has(required)) throw new Error(`AAI CSV: missing column "${required}"`);
  }
  const get = (fields: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? "" : (fields[i] ?? "").trim();
  };

  return (fields: string[]): AaiReading | "invalid" | "unusable" => {
    if (get(fields, "is_valid").toLowerCase() !== "true") return "invalid";
    const pmRaw = get(fields, "pm25");
    const pm25 = pmRaw === "" ? NaN : Number(pmRaw);
    const lat = Number(get(fields, "lat"));
    const lng = Number(get(fields, "lon"));
    const dt = get(fields, "datetime");
    const id = get(fields, "id");
    if (!id || !/^\d{4}-\d{2}-\d{2} \d{2}/.test(dt)) return "unusable";
    if (!Number.isFinite(pm25) || pm25 < 0 || pm25 > PM25_MAX) return "unusable";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "unusable";
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
      return "unusable";
    }
    const source = get(fields, "source");
    return {
      stationId: stationIdFor(source, id),
      name: get(fields, "name") || id,
      lat,
      lng,
      origin: ORIGINS[source.toLowerCase()] || get(fields, "origin") || source,
      district: get(fields, "district_ru") || null,
      day: dt.slice(0, 10),
      hour: Number(dt.slice(11, 13)),
      pm25,
    };
  };
}

/** Hours since the epoch for a local day + hour — only used for adjacency. */
function hourIndex(day: string, hour: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour) / 3600000;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Removes sensor faults from one station's hourly series, in place.
 *
 * - Stuck sensor: the same value for STUCK_RUN_HOURS consecutive hours.
 *   Real air is never that flat for a whole day.
 * - Spike: a reading far above its neighbours (±3 h). It must clear both
 *   twice the neighbourhood median plus 30 µg/m³ and six robust standard
 *   deviations (MAD), so a winter evening ramp — where the neighbours climb
 *   too — is left alone, while a lone 480 among 10s is dropped.
 *
 * Returns how many hours each rule removed.
 */
export function cleanSeries(series: Map<number, number>): { stuck: number; spikes: number } {
  const keys = [...series.keys()].sort((a, b) => a - b);
  let stuck = 0;
  let spikes = 0;

  // Stuck runs first, so a flat line doesn't serve as a spike baseline.
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    const continues =
      i < keys.length &&
      keys[i] === keys[i - 1] + 1 &&
      series.get(keys[i]) === series.get(keys[start]);
    if (continues) continue;
    if (i - start >= STUCK_RUN_HOURS) {
      for (let j = start; j < i; j++) series.delete(keys[j]);
      stuck += i - start;
    }
    start = i;
  }

  // Spikes are judged against the original neighbours, then removed
  // together, so one removal can't change the verdict on the next hour.
  const flagged: number[] = [];
  for (const k of series.keys()) {
    const neighbours: number[] = [];
    for (let d = -SPIKE_WINDOW; d <= SPIKE_WINDOW; d++) {
      if (d === 0) continue;
      const v = series.get(k + d);
      if (v !== undefined) neighbours.push(v);
    }
    if (neighbours.length < 3) continue;
    const med = median(neighbours);
    const mad = median(neighbours.map((v) => Math.abs(v - med)));
    const v = series.get(k)!;
    if (v > 2 * med + 30 && v > med + 6 * 1.4826 * mad) flagged.push(k);
  }
  for (const k of flagged) series.delete(k);
  spikes = flagged.length;

  return { stuck, spikes };
}

/**
 * Collects a file's readings, cleans every station's series and folds it
 * into one row per station per local day.
 */
export class AaiMonthBuilder {
  private parse: ReturnType<typeof makeRowParser> | null = null;
  private series = new Map<string, Map<number, number>>();
  private days = new Map<number, string>();
  private meta = new Map<string, StationMeta>();
  readonly stats: CleaningStats = {
    rows: 0,
    invalid: 0,
    unusable: 0,
    stuck: 0,
    spikes: 0,
    kept: 0,
  };

  /** Feed lines in file order; the first non-empty line is the header. */
  addLine(line: string): void {
    if (!line.trim()) return;
    const fields = parseCsvLine(line.replace(/\r$/, ""));
    if (!this.parse) {
      this.parse = makeRowParser(fields);
      return;
    }
    this.stats.rows++;
    const r = this.parse(fields);
    if (r === "invalid") return void this.stats.invalid++;
    if (r === "unusable") return void this.stats.unusable++;

    const idx = hourIndex(r.day, r.hour);
    let s = this.series.get(r.stationId);
    if (!s) this.series.set(r.stationId, (s = new Map()));
    // A duplicate hour (rare) is averaged rather than overwritten.
    const prev = s.get(idx);
    s.set(idx, prev === undefined ? r.pm25 : (prev + r.pm25) / 2);
    this.days.set(idx, r.day);
    // Last row wins: the newest name/position of a unit that moved.
    this.meta.set(r.stationId, {
      stationId: r.stationId,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      origin: r.origin,
      district: r.district,
    });
  }

  finish(): { rows: DailyRow[]; stations: StationMeta[]; firstDay: string | null; lastDay: string | null } {
    const rows: DailyRow[] = [];
    let firstDay: string | null = null;
    let lastDay: string | null = null;

    for (const [stationId, s] of this.series) {
      const { stuck, spikes } = cleanSeries(s);
      this.stats.stuck += stuck;
      this.stats.spikes += spikes;

      const byDay = new Map<string, (number | null)[]>();
      for (const [idx, v] of s) {
        const day = this.days.get(idx)!;
        let hours = byDay.get(day);
        if (!hours) byDay.set(day, (hours = Array(24).fill(null)));
        hours[((idx % 24) + 24) % 24] = Math.round(v * 10) / 10;
      }
      for (const [day, pm25] of byDay) {
        const hours = pm25.filter((v) => v !== null).length;
        this.stats.kept += hours;
        rows.push({ stationId, day, pm25, hours });
        if (!firstDay || day < firstDay) firstDay = day;
        if (!lastDay || day > lastDay) lastDay = day;
      }
    }

    const stations = [...this.meta.values()].filter((m) => this.series.get(m.stationId)?.size);
    return { rows, stations, firstDay, lastDay };
  }
}
