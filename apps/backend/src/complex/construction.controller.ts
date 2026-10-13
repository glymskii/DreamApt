import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { ConstructionSyncService } from "./construction-sync.service";

/**
 * Admin-driven sync of under-construction ЖК from Krisha's «Новостройки»
 * catalog. The admin client drives both loops; every call is a short
 * synchronous request (see ConstructionSyncService).
 */
@Controller("admin/construction")
@UseGuards(AdminGuard)
export class ConstructionController {
  constructor(private readonly sync: ConstructionSyncService) {}

  /** Counters for the admin tab. */
  @Get("stats")
  stats() {
    return this.sync.stats();
  }

  /** Step 1: one catalog page per call. Loop while `hasNextPage`, passing
   *  back the `since` returned by page 1. */
  @Post("import-page")
  importPage(@Query("page") page: string = "1", @Query("since") since?: string) {
    return this.sync.importCatalogPage(parseInt(page) || 1, since || undefined);
  }

  /** Step 2: ЖК pages for a few complexes per call (default 6, max 10).
   *  Loop until `remaining === 0`. */
  @Post("enrich-batch")
  enrichBatch(
    @Query("limit") limit: string = "6",
    @Query("refreshBefore") refreshBefore?: string,
  ) {
    const lim = Math.min(10, Math.max(1, parseInt(limit) || 6));
    return this.sync.enrichBatch(lim, refreshBefore || undefined);
  }

  /** Parse one ЖК page without saving — checks the parser on live markup. */
  @Get("preview")
  preview(@Query("url") url: string = "") {
    return this.sync.preview(url);
  }
}
