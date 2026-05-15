import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  UpdateDateColumn,
} from "typeorm";

/**
 * Hourly rollup of API request traffic — one row per
 * (hour, pathTemplate, method, statusCode, userType) tuple.
 *
 * The interceptor increments the `count` column on every request via an
 * UPSERT, so the table never grows by N rows per request — it grows by
 * "distinct dimension combinations per hour", which is bounded (~hundreds
 * of rows/hour even at heavy traffic).
 *
 * Why hourly buckets and not raw rows: a single API call costs us one row
 * insert + maybe an index update. At 100 RPS we'd write 8M rows/day if we
 * stored each request individually — death on a free Postgres tier. Hourly
 * counters keep the table small enough to query for 30-day windows without
 * pre-aggregation.
 *
 * Why `pathTemplate` and not raw URL: collapsing `/api/complexes/abc-123`
 * and `/api/complexes/def-456` into `/api/complexes/:id` keeps the cardinality
 * bounded — otherwise every fresh UUID would create a new row.
 */
@Entity("request_stats")
@Unique("uq_request_stats_bucket", [
  "hourBucket",
  "pathTemplate",
  "method",
  "statusCode",
  "userType",
])
@Index("idx_request_stats_hour", ["hourBucket"])
export class RequestStatEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Start of the hour the request landed in (UTC). */
  @Column({ name: "hour_bucket", type: "timestamp" })
  hourBucket: Date;

  /** Normalised route shape — UUIDs and numeric IDs replaced by `:id`. */
  @Column({ name: "path_template" })
  pathTemplate: string;

  @Column({ length: 10 })
  method: string;

  @Column({ name: "status_code", type: "int" })
  statusCode: number;

  /** "guest" | "user" | "admin" — coarse user-type breakdown for the
   *  dashboard, derived from req.user?.role at interceptor time. */
  @Column({ name: "user_type", length: 10 })
  userType: string;

  @Column({ type: "int", default: 1 })
  count: number;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
