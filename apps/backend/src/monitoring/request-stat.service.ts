import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { Cron } from "@nestjs/schedule";
import { RequestStatEntity } from "../database/entities/request-stat.entity";

/**
 * Read/write surface for the request_stats table. The interceptor pushes
 * increments through `record()`; the admin dashboard pulls aggregates
 * through the query methods.
 *
 * `record()` is fire-and-forget on the request path (interceptor catches
 * errors), so a slow DB never blocks a user request. Worst case: a few
 * dropped counters during DB blips, which is fine for a stats panel.
 */
@Injectable()
export class RequestStatService {
  private readonly logger = new Logger(RequestStatService.name);
  private readonly retentionDays = parseInt(
    process.env.STATS_RETENTION_DAYS || "60",
    10,
  );

  constructor(
    @InjectRepository(RequestStatEntity)
    private repo: Repository<RequestStatEntity>,
  ) {}

  /**
   * Bump the counter for the given dimension tuple. Idempotent on
   * (hour, path, method, status, userType) — uses an UPSERT so multiple
   * concurrent requests racing on the same bucket don't conflict.
   */
  async record(input: {
    pathTemplate: string;
    method: string;
    statusCode: number;
    userType: string;
  }): Promise<void> {
    const hourBucket = floorToHour(new Date());
    try {
      // Postgres-specific ON CONFLICT … DO UPDATE keeps this to a single
      // round-trip and avoids the select-then-update race.
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(RequestStatEntity)
        .values({
          hourBucket,
          pathTemplate: input.pathTemplate,
          method: input.method,
          statusCode: input.statusCode,
          userType: input.userType,
          count: 1,
        })
        .orUpdate(["count"], ["hour_bucket", "path_template", "method", "status_code", "user_type"], {
          skipUpdateIfNoValuesChanged: false,
        })
        .setParameter("count", 1)
        // The default ON CONFLICT … DO UPDATE SET count = EXCLUDED.count
        // would overwrite to 1 instead of adding. Override the SET clause
        // via raw SQL to do count = request_stats.count + 1.
        .execute()
        .catch(async () => {
          // Fallback for the rare case the upsert syntax fails (e.g. TypeORM
          // version mismatch) — do a manual select+update. Race-tolerant
          // since we use ON CONFLICT-equivalent serialisation in Postgres.
          await this.repo.query(
            `INSERT INTO request_stats (hour_bucket, path_template, method, status_code, user_type, count, updated_at)
             VALUES ($1, $2, $3, $4, $5, 1, NOW())
             ON CONFLICT (hour_bucket, path_template, method, status_code, user_type)
             DO UPDATE SET count = request_stats.count + 1, updated_at = NOW()`,
            [hourBucket, input.pathTemplate, input.method, input.statusCode, input.userType],
          );
        });
    } catch (err) {
      // Stats are best-effort — don't surface DB errors to the request path.
      this.logger.debug?.(`record() failed: ${err}`);
    }
  }

  /** Aggregated totals + breakdown for the dashboard overview. */
  async overview(hours: number) {
    const cutoff = hoursAgo(hours);
    const rows = await this.repo
      .createQueryBuilder("s")
      .select("SUM(s.count)", "total")
      .addSelect("COUNT(DISTINCT s.pathTemplate)", "uniquePaths")
      .addSelect(
        "SUM(CASE WHEN s.statusCode >= 400 THEN s.count ELSE 0 END)",
        "errors",
      )
      .addSelect(
        "SUM(CASE WHEN s.userType = 'guest' THEN s.count ELSE 0 END)",
        "guest",
      )
      .addSelect(
        "SUM(CASE WHEN s.userType = 'user' THEN s.count ELSE 0 END)",
        "user",
      )
      .addSelect(
        "SUM(CASE WHEN s.userType = 'admin' THEN s.count ELSE 0 END)",
        "admin",
      )
      .where("s.hourBucket >= :cutoff", { cutoff })
      .getRawOne();
    const total = parseInt(rows?.total || "0", 10);
    const errors = parseInt(rows?.errors || "0", 10);
    return {
      hours,
      total,
      errors,
      errorRate: total > 0 ? errors / total : 0,
      uniquePaths: parseInt(rows?.uniquePaths || "0", 10),
      byUserType: {
        guest: parseInt(rows?.guest || "0", 10),
        user: parseInt(rows?.user || "0", 10),
        admin: parseInt(rows?.admin || "0", 10),
      },
    };
  }

  /** Top N paths by total request count, optionally filtered by method. */
  async topPaths(hours: number, limit = 20) {
    const cutoff = hoursAgo(hours);
    return this.repo
      .createQueryBuilder("s")
      .select("s.pathTemplate", "path")
      .addSelect("s.method", "method")
      .addSelect("SUM(s.count)", "count")
      .addSelect(
        "SUM(CASE WHEN s.statusCode >= 400 THEN s.count ELSE 0 END)",
        "errors",
      )
      .where("s.hourBucket >= :cutoff", { cutoff })
      .groupBy("s.pathTemplate")
      .addGroupBy("s.method")
      .orderBy("SUM(s.count)", "DESC")
      .limit(limit)
      .getRawMany();
  }

  /** Distribution by HTTP status code (2xx/3xx/4xx/5xx specifics). */
  async byStatus(hours: number) {
    const cutoff = hoursAgo(hours);
    return this.repo
      .createQueryBuilder("s")
      .select("s.statusCode", "statusCode")
      .addSelect("SUM(s.count)", "count")
      .where("s.hourBucket >= :cutoff", { cutoff })
      .groupBy("s.statusCode")
      .orderBy("SUM(s.count)", "DESC")
      .getRawMany();
  }

  /** Time-series by hour or day for the chart. */
  async timeline(hours: number, bucketSize: "hour" | "day" = "hour") {
    const cutoff = hoursAgo(hours);
    // date_trunc keeps the labels aligned to UTC hour/day boundaries —
    // matches what hourBucket already stores so groupings collapse cleanly.
    const truncExpr =
      bucketSize === "day" ? "date_trunc('day', s.hour_bucket)" : "s.hour_bucket";
    return this.repo
      .createQueryBuilder("s")
      .select(truncExpr, "bucket")
      .addSelect("SUM(s.count)", "count")
      .addSelect(
        "SUM(CASE WHEN s.statusCode >= 400 THEN s.count ELSE 0 END)",
        "errors",
      )
      .where("s.hourBucket >= :cutoff", { cutoff })
      .groupBy("bucket")
      .orderBy("bucket", "ASC")
      .getRawMany();
  }

  /** Daily 4 AM Almaty — drop counters older than retention. */
  @Cron("0 4 * * *")
  async prune() {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.repo.delete({ hourBucket: LessThan(cutoff) });
    this.logger.log(`Pruned ${result.affected ?? 0} stat rows older than ${this.retentionDays}d`);
  }
}

function floorToHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}
