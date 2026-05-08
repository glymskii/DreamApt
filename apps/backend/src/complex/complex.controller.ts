import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  Header,
} from "@nestjs/common";
import { ComplexService } from "./complex.service";
import { KrishaComplexParserService } from "./krisha-complex-parser.service";
import { SearchService } from "../search/search.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { OptionalJwtGuard } from "../auth/optional-jwt.guard";
import { AdminGuard } from "../auth/admin.guard";

@Controller()
export class ComplexController {
  constructor(
    private complexService: ComplexService,
    private krishaComplexParser: KrishaComplexParserService,
    private searchService: SearchService,
  ) {}

  // ── PUBLIC endpoints (no auth required) ──

  // Public endpoints get a 60s edge cache; matches in-memory TTL so a CDN
  // hit doesn't outlive the data version. `s-maxage` lets Vercel/Cloudflare
  // cache while keeping `max-age=0` on the browser to avoid stale-on-back.
  @Get("complexes/map-data")
  @Header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120")
  async getGlobalMapData() {
    return this.complexService.findAllForMap();
  }

  @Get("complexes/all")
  @Header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120")
  async findAllGlobal(
    @Query("sort") sort: string = "scoreTotal",
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "50",
  ) {
    return this.complexService.findAllGlobal(
      sort,
      parseInt(page) || 1,
      parseInt(limit) || 50,
    );
  }

  @Get("complexes/:id")
  @Header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120")
  async findOne(@Param("id") id: string) {
    return this.complexService.findOne(id);
  }

  @Get("complexes/:id/seismic")
  @Header("Cache-Control", "public, max-age=300, s-maxage=600")
  async getSeismic(@Param("id") id: string) {
    return this.complexService.getSeismicRisk(id);
  }

  /** 2GIS reviews — fully public, anchor of "open data" value prop.
   * Service caches 24h in DB; we still hint downstream caches at 5min. */
  @Get("complexes/:id/reviews")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600")
  async getReviews(@Param("id") id: string) {
    return this.complexService.getReviews(id);
  }

  // ── Mixed: public but unlocks data when authenticated ──

  /**
   * Shutov rating: guests see only existence + locked teaser.
   * Authenticated users get full data (category, label, color, description).
   */
  @Get("complexes/:id/shutov")
  @UseGuards(OptionalJwtGuard)
  async getShutov(@Param("id") id: string, @Req() req: any) {
    const full = await this.complexService.getShutovRating(id);
    if (!full.found) return { found: false };
    if (!req.user) {
      // Locked teaser for guests
      return {
        found: true,
        locked: true,
        name: full.name,
      };
    }
    const { found: _f, ...rest } = full as any;
    return { found: true, locked: false, ...rest };
  }

  // ── PRIVATE endpoints (login required) ──

  /** Properties list — only for authenticated users */
  @Get("complexes/:id/properties")
  @UseGuards(JwtAuthGuard)
  async findProperties(
    @Param("id") id: string,
    @Query("sort") sort: string = "scoreTotal",
  ) {
    return { properties: await this.complexService.findProperties(id, sort) };
  }

  // ── Project-scoped (private) ──

  @Get("projects/:projectId/complexes")
  @UseGuards(JwtAuthGuard)
  async findByProject(
    @Param("projectId") projectId: string,
    @Req() req: any,
    @Query("sort") sort: string = "scoreTotal",
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20",
  ) {
    await this.assertProjectAccess(projectId, req.user);
    return this.complexService.findByProject(
      projectId,
      sort,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
  }

  @Get("projects/:projectId/map-data")
  @UseGuards(JwtAuthGuard)
  async getMapData(@Param("projectId") projectId: string, @Req() req: any) {
    await this.assertProjectAccess(projectId, req.user);
    return this.complexService.getMapData(projectId);
  }

  private async assertProjectAccess(
    projectId: string,
    user: { id: string; role?: string } | undefined,
  ) {
    if (!user) throw new UnauthorizedException();
    const project = await this.complexService.getProjectForScoring(projectId);
    if (!project) throw new UnauthorizedException("Project not found");
    if (user.role !== "admin" && project.userId !== user.id) {
      // Don't reveal which project IDs exist — same NotFound semantics as ownership-fail
      throw new UnauthorizedException("Project not found");
    }
  }

  // ── Admin only (data ops) ──

  @Post("complexes/cleanup-non-almaty")
  @UseGuards(AdminGuard)
  async cleanupNonAlmaty() {
    const deleted = await this.complexService.deleteNonAlmaty();
    return { deleted };
  }

  /** Backfill yearBuilt/floorsMax/price aggregates from property records.
   *  Cheap (DB-only, no upstream calls). Run after a schema bump that adds
   *  new aggregate columns to populate historical rows. */
  @Post("complexes/recompute-aggregates")
  @UseGuards(AdminGuard)
  async recomputeAggregates() {
    return this.complexService.recomputeAggregatesFromProperties();
  }

  @Post("complexes/parse-krisha")
  @UseGuards(AdminGuard)
  async parseAllFromKrisha() {
    this.krishaComplexParser.parseAndSaveAll().catch((err) => {
      console.error("Krisha complex parsing failed:", err);
    });
    return {
      started: true,
      message: "Parsing all Almaty complexes from Krisha.kz in background",
    };
  }

  /**
   * Synchronous batch enrichment driven by the admin client. Each call
   * processes up to `limit` (default 8, max 20) ЖК with a Krisha URL but
   * missing yearBuilt/floorsMax. Returns enough state for a curl loop to
   * resume. Render's background-task killer doesn't apply here — this is
   * a regular HTTP request that completes synchronously.
   */
  @Post("complexes/enrich-batch")
  @UseGuards(AdminGuard)
  async enrichBatch(
    @Query("limit") limit: string = "8",
    @Query("offset") offset: string = "0",
  ) {
    const lim = Math.min(20, Math.max(1, parseInt(limit) || 8));
    const off = Math.max(0, parseInt(offset) || 0);
    return this.krishaComplexParser.enrichChunk(lim, off);
  }

  @Post("projects/:projectId/migrate-complexes")
  @UseGuards(JwtAuthGuard)
  async migrateComplexes(@Param("projectId") projectId: string, @Req() req: any) {
    await this.assertProjectAccess(projectId, req.user);
    await this.searchService.groupPropertiesIntoComplexes(projectId);
    const project = await this.complexService.getProjectForScoring(projectId);
    if (project?.interviewAnswers) {
      await this.searchService.scoreComplexes(projectId, project.interviewAnswers);
    }
    const result = await this.complexService.findByProject(projectId, "scoreTotal", 1, 100);
    return { migrated: true, complexesCreated: result.total };
  }
}
