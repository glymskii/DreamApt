import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { RequestStatService } from "./request-stat.service";

/**
 * Admin-only traffic dashboard endpoints. Every method takes a `hours`
 * window (default 24) so the dashboard UI can flip between "last 24h",
 * "last 7 days", "last 30 days" with the same shape of request.
 *
 * Aggregations are computed on the fly via SQL — at our scale (~hundreds
 * of distinct path×status combos per hour, ~60 days retention) the
 * grouping queries finish in tens of ms with the existing index on
 * hour_bucket.
 */
@Controller("admin/stats")
@UseGuards(AdminGuard)
export class MonitoringController {
  constructor(private readonly stats: RequestStatService) {}

  @Get("overview")
  async overview(@Query("hours") hoursRaw?: string) {
    const hours = clampHours(hoursRaw, 24);
    return this.stats.overview(hours);
  }

  @Get("by-path")
  async byPath(
    @Query("hours") hoursRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const hours = clampHours(hoursRaw, 24);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw || "20", 10) || 20));
    return this.stats.topPaths(hours, limit);
  }

  @Get("by-status")
  async byStatus(@Query("hours") hoursRaw?: string) {
    const hours = clampHours(hoursRaw, 24);
    return this.stats.byStatus(hours);
  }

  @Get("timeline")
  async timeline(
    @Query("hours") hoursRaw?: string,
    @Query("bucket") bucket?: string,
  ) {
    const hours = clampHours(hoursRaw, 24);
    const bucketSize: "hour" | "day" = bucket === "day" ? "day" : "hour";
    return this.stats.timeline(hours, bucketSize);
  }
}

/** Allow 1h..1 year, cap to prevent runaway queries. */
function clampHours(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(24 * 365, Math.max(1, n));
}
