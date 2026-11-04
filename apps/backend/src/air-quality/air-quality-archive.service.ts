import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { AirQualityDailyEntity } from "../database/entities/air-quality-daily.entity";
import { AirQualityImportEntity } from "../database/entities/air-quality-import.entity";
import { AaiMonthBuilder, type CleaningStats, type DailyRow, type StationMeta } from "./aai-archive";
import { LOCAL_TIME_SQL } from "./air-quality-aggregate.service";

const DATASET_REPO = "Almaty-Air-Initiative/kz-open-air-quality-data";
/** Files are addressed by name on the raw host, not listed through the
 *  GitHub API: unauthenticated API calls are capped at 60 an hour per IP,
 *  and a PaaS shares its outbound IPs with everyone else. */
const RAW_BASE = `https://raw.githubusercontent.com/${DATASET_REPO}/main`;
const USER_AGENT = "dreamapt-air-archive";
/** Files smaller than this are empty placeholders (header only or "[]"). */
const MIN_FILE_BYTES = 1024;
const LIST_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const INSERT_BATCH = 1000;
/** Let the app answer requests before the first sync starts streaming. */
const BOOT_DELAY_MS = 30_000;

export interface DatasetFile {
  path: string;
  sha: string;
  size: number;
  downloadUrl: string;
}

/** What the background jobs last did — served with /air-quality/coverage,
 *  so a stuck import can be diagnosed without the host's logs. */
export interface ArchiveStatus {
  /** When this process started: a value that keeps moving means restarts. */
  bootedAt: string;
  sync: {
    startedAt: string | null;
    finishedAt: string | null;
    /** Dataset files in the window. */
    files: number;
    imported: string[];
    errors: string[];
  };
  rollup: { at: string | null; written: number; error: string | null };
}

export interface ImportResult {
  path: string;
  rows: number;
  stations: number;
  firstDay: string | null;
  lastDay: string | null;
  stats: CleaningStats;
}

/**
 * Keeps `air_quality_daily` — the long-term PM2.5 history — filled from two
 * sources:
 *
 * 1. Almaty Air Initiative's open dataset on GitHub: hourly readings of the
 *    city's sensor networks (AirGradient, IQAir, AirKaz…), one CSV per
 *    month. Synced on boot and daily; a file is re-imported only when its
 *    ETag (content hash) changes. Readings are cleaned on the way in
 *    (aai-archive.ts).
 *    Months older than AIR_ARCHIVE_MONTHS are ignored.
 * 2. Our own live snapshots (`air_quality_readings`), rolled up hourly into
 *    the days the dataset hasn't published yet.
 *
 * Writes are serialised in-process so an import and a rollup never race on
 * the same days.
 */
@Injectable()
export class AirQualityArchiveService implements OnModuleInit {
  private readonly logger = new Logger(AirQualityArchiveService.name);
  private readonly months = Math.max(1, parseInt(process.env.AIR_ARCHIVE_MONTHS || "13", 10) || 13);
  private queue: Promise<unknown> = Promise.resolve();
  private status: ArchiveStatus = {
    bootedAt: new Date().toISOString(),
    sync: { startedAt: null, finishedAt: null, files: 0, imported: [], errors: [] },
    rollup: { at: null, written: 0, error: null },
  };

  constructor(
    @InjectRepository(AirQualityDailyEntity)
    private dailyRepo: Repository<AirQualityDailyEntity>,
    @InjectRepository(AirQualityImportEntity)
    private importsRepo: Repository<AirQualityImportEntity>,
  ) {}

  onModuleInit() {
    if (process.env.AIR_ARCHIVE_SYNC === "false") return;
    setTimeout(() => {
      this.rollupLive()
        .catch((err) => this.logger.warn(`Initial air rollup failed: ${err}`))
        .then(() => this.syncFromGitHub())
        .catch((err) => this.logger.warn(`Initial air archive sync failed: ${err}`));
    }, BOOT_DELAY_MS).unref();
  }

  getStatus(): ArchiveStatus {
    return structuredClone(this.status);
  }

  /** Shortly after each :30 snapshot, fold today's readings in. */
  @Cron("45 * * * *")
  async scheduledRollup() {
    await this.rollupLive().catch((err) => this.logger.warn(`Air rollup failed: ${err}`));
  }

  /** The dataset is republished every few days at most; once a day is plenty. */
  @Cron("0 5 * * *", { timeZone: "Asia/Almaty" })
  async scheduledSync() {
    if (process.env.AIR_ARCHIVE_SYNC === "false") return;
    await this.syncFromGitHub().catch((err) => this.logger.warn(`Air archive sync failed: ${err}`));
  }

  private serial<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Newest archived day (any source), YYYY-MM-DD; null when empty. */
  async lastArchivedDay(): Promise<string | null> {
    const [row] = await this.dailyRepo.query(
      `SELECT to_char(MAX(day), 'YYYY-MM-DD') AS day FROM air_quality_daily`,
    );
    return row?.day ?? null;
  }

  /**
   * The dataset's monthly files inside our window, oldest first. Each month
   * has a fixed name (open_sensors/<year>_data/AAI_<year>_<MM>.csv); a HEAD
   * request says whether it's published, how big it is and its ETag.
   */
  async listDatasetFiles(now = new Date()): Promise<DatasetFile[]> {
    // Month arithmetic on Almaty's calendar (UTC+5, no DST).
    const local = new Date(now.getTime() + 5 * 3600000);
    const current = local.getUTCFullYear() * 12 + local.getUTCMonth();
    const files: DatasetFile[] = [];

    for (let key = current - this.months; key <= current; key++) {
      const year = Math.floor(key / 12);
      const month = String((key % 12) + 1).padStart(2, "0");
      const path = `open_sensors/${year}_data/AAI_${year}_${month}.csv`;
      const url = `${RAW_BASE}/${path}`;
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      });
      if (res.status === 404) continue; // not published (yet)
      if (!res.ok) throw new Error(`HEAD ${path}: HTTP ${res.status}`);
      const size = Number(res.headers.get("content-length") || 0);
      const etag = (res.headers.get("etag") || "").replace(/^W\//, "").replace(/"/g, "");
      if (size < MIN_FILE_BYTES || !etag) continue; // empty placeholder month
      files.push({ path, sha: etag.slice(0, 64), size, downloadUrl: url });
    }
    return files;
  }

  /**
   * Imports every new or republished file. Safe to call repeatedly. One
   * failing file doesn't stop the others; failures land in getStatus().
   */
  syncFromGitHub(): Promise<ImportResult[]> {
    return this.serial(async () => {
      const sync: ArchiveStatus["sync"] = {
        startedAt: new Date().toISOString(),
        finishedAt: null,
        files: 0,
        imported: [],
        errors: [],
      };
      this.status.sync = sync;
      const results: ImportResult[] = [];
      try {
        const files = await this.listDatasetFiles();
        sync.files = files.length;
        const known = new Map((await this.importsRepo.find()).map((i) => [i.path, i.sha]));
        const todo = files.filter((f) => known.get(f.path) !== f.sha);
        if (todo.length === 0) this.logger.log(`Air archive up to date (${files.length} dataset files)`);
        for (const file of todo) {
          // One file at a time, each in its own transaction: a sleep or
          // crash mid-sync leaves finished months in place for the next run.
          try {
            results.push(await this.downloadAndImport(file));
            sync.imported.push(file.path);
          } catch (err) {
            sync.errors.push(`${file.path}: ${err}`);
            this.logger.warn(`AAI import ${file.path} failed: ${err}`);
          }
        }
      } catch (err) {
        sync.errors.push(String(err));
        throw err;
      } finally {
        sync.finishedAt = new Date().toISOString();
      }
      return results;
    });
  }

  private async downloadAndImport(file: DatasetFile): Promise<ImportResult> {
    const res = await fetch(file.downloadUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const lines = createInterface({
      input: Readable.fromWeb(res.body as any),
      crlfDelay: Infinity,
    });
    return this.importLines(file.path, file.sha, lines);
  }

  /** Parses, cleans and stores one dataset file (any line source). */
  importFile(path: string, sha: string, lines: AsyncIterable<string> | Iterable<string>): Promise<ImportResult> {
    return this.serial(() => this.importLines(path, sha, lines));
  }

  private async importLines(
    path: string,
    sha: string,
    lines: AsyncIterable<string> | Iterable<string>,
  ): Promise<ImportResult> {
    const builder = new AaiMonthBuilder();
    for await (const line of lines) builder.addLine(line);
    const { rows, stations, firstDay, lastDay } = builder.finish();
    const previous = await this.importsRepo.findOne({ where: { path } });

    await this.dailyRepo.manager.transaction(async (m) => {
      // The dataset owns every day it covers: drop our live rollup and any
      // earlier version of this file across both versions' ranges.
      const from = [firstDay, previous?.firstDay].filter(Boolean).sort()[0];
      const to = [lastDay, previous?.lastDay].filter(Boolean).sort().pop();
      if (from && to) {
        await m.query(`DELETE FROM air_quality_daily WHERE day BETWEEN $1 AND $2`, [from, to]);
      }
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await this.insertDays(m, rows.slice(i, i + INSERT_BATCH));
      }
      for (let i = 0; i < stations.length; i += INSERT_BATCH) {
        await this.upsertStations(m, stations.slice(i, i + INSERT_BATCH));
      }
      await m.getRepository(AirQualityImportEntity).save({
        path,
        sha,
        rows: rows.length,
        stations: stations.length,
        firstDay,
        lastDay,
        stats: { ...builder.stats },
      });
    });

    const s = builder.stats;
    this.logger.log(
      `AAI import ${path}: ${rows.length} station-days, ${stations.length} stations, ` +
        `${firstDay}…${lastDay}; rows ${s.rows}, invalid ${s.invalid}, unusable ${s.unusable}, ` +
        `stuck ${s.stuck}, spikes ${s.spikes}, kept ${s.kept} station-hours`,
    );
    return { path, rows: rows.length, stations: stations.length, firstDay, lastDay, stats: { ...s } };
  }

  private async insertDays(m: { query: (sql: string, params?: any[]) => Promise<any> }, rows: DailyRow[]) {
    if (rows.length === 0) return;
    const params: unknown[] = [];
    const values = rows.map((r) => {
      params.push(r.stationId, r.day, r.pm25, r.hours);
      const n = params.length;
      return `($${n - 3}, $${n - 2}::date, $${n - 1}::real[], $${n}, 'aai', now())`;
    });
    await m.query(
      `INSERT INTO air_quality_daily (station_id, day, pm25, hours, source, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (station_id, day) DO UPDATE
         SET pm25 = EXCLUDED.pm25, hours = EXCLUDED.hours, source = 'aai', updated_at = now()`,
      params,
    );
  }

  private async upsertStations(m: { query: (sql: string, params?: any[]) => Promise<any> }, stations: StationMeta[]) {
    if (stations.length === 0) return;
    const params: unknown[] = [];
    const values = stations.map((s) => {
      params.push(s.stationId, s.name, s.lat, s.lng, s.origin, s.district);
      const n = params.length;
      return `($${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n}, now())`;
    });
    await m.query(
      `INSERT INTO air_quality_stations (station_id, name, lat, lng, origin, district, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (station_id) DO UPDATE
         SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
             origin = COALESCE(EXCLUDED.origin, air_quality_stations.origin),
             district = COALESCE(EXCLUDED.district, air_quality_stations.district),
             updated_at = now()`,
      params,
    );
  }

  /**
   * Folds our live snapshots into `air_quality_daily` as `live` days.
   *
   * Only days after the dataset's newest day are touched — those the
   * dataset hasn't published yet. Each run redoes the last two rolled-up
   * days, so late snapshots still land; the first run takes everything
   * the raw table holds. Hours are Almaty wall-clock (LOCAL_TIME_SQL), and
   * each station-hour is the mean of its snapshots — the same
   * de-duplication the aggregates always did.
   *
   * Returns how many station-days were written.
   */
  rollupLive(): Promise<number> {
    return this.serial(() =>
      this.rollupOnce().then(
        (written) => {
          this.status.rollup = { at: new Date().toISOString(), written, error: null };
          return written;
        },
        (err) => {
          this.status.rollup = { at: new Date().toISOString(), written: 0, error: String(err) };
          throw err;
        },
      ),
    );
  }

  private async rollupOnce(): Promise<number> {
    const [wm] = await this.dailyRepo.query(
      `SELECT to_char(MAX(day) FILTER (WHERE source = 'aai'), 'YYYY-MM-DD') AS aai_last,
              to_char(MAX(day) FILTER (WHERE source = 'live') - 1, 'YYYY-MM-DD') AS live_from
       FROM air_quality_daily`,
    );
    const after: string = wm?.aai_last ?? "1970-01-01";
    const from: string = wm?.live_from ?? "1970-01-01";
    const fromDay = from > after ? from : null;
    // Raw rows are scanned from two days before the first day, which
    // covers naive local timestamps (≤ 6 h off) on the index.
    const rawSince = fromDay ?? after;

    const written = await this.dailyRepo.query(
      `WITH local AS (
         SELECT station_id, ${LOCAL_TIME_SQL} AS t, pm25::float8 AS pm25
         FROM air_quality_readings
         WHERE pm25 IS NOT NULL AND recorded_at >= $1::date - 2
       ),
       hourly AS (
         SELECT station_id, t::date AS day, EXTRACT(HOUR FROM t)::int AS hour, AVG(pm25) AS pm25
         FROM local
         WHERE t::date > $2::date AND ($3::date IS NULL OR t::date >= $3::date)
         GROUP BY 1, 2, 3
       ),
       days AS (
         SELECT station_id, day, jsonb_object_agg(hour, round(pm25::numeric, 1)) AS m, COUNT(*)::int AS hours
         FROM hourly GROUP BY 1, 2
       ),
       upserted AS (
         INSERT INTO air_quality_daily (station_id, day, pm25, hours, source, updated_at)
         SELECT station_id, day,
                ARRAY(SELECT (m ->> g::text)::real FROM generate_series(0, 23) g),
                hours, 'live', now()
         FROM days
         ON CONFLICT (station_id, day) DO UPDATE
           SET pm25 = EXCLUDED.pm25, hours = EXCLUDED.hours, updated_at = now()
           WHERE air_quality_daily.source = 'live'
         RETURNING 1
       )
       SELECT COUNT(*)::int AS n FROM upserted`,
      [rawSince, after, fromDay],
    );

    // Names and positions for the stations seen in that window.
    await this.dailyRepo.query(
      `INSERT INTO air_quality_stations (station_id, name, lat, lng, origin, district, updated_at)
       SELECT DISTINCT ON (station_id) station_id, name, lat::float8, lng::float8, origin, district, now()
       FROM air_quality_readings
       WHERE pm25 IS NOT NULL AND recorded_at >= $1::date - 2
       ORDER BY station_id, recorded_at DESC
       ON CONFLICT (station_id) DO UPDATE
         SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
             origin = COALESCE(EXCLUDED.origin, air_quality_stations.origin),
             district = COALESCE(EXCLUDED.district, air_quality_stations.district),
             updated_at = now()`,
      [rawSince],
    );

    const n = Number(written?.[0]?.n ?? 0);
    if (n > 0) this.logger.log(`Air rollup: ${n} live station-days after ${after}`);
    return n;
  }
}
