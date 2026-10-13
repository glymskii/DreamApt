import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { findNearestFault, findShutovRating } from "@dreamapt/shared";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import {
  KrishaComplexParserService,
  constructionFieldsFromDetail,
  type ComplexPatch,
} from "./krisha-complex-parser.service";
import { ComplexService } from "./complex.service";
import { COMPLETED, UNDER_CONSTRUCTION, floorSegmentFor } from "./krisha-complex-html";

// A ЖК page is re-read at most this often: «Срок сдачи» moves slowly and
// every fetch is one more request against Krisha.
const DETAIL_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const DETAIL_DELAY_MS = 1500; // same gentle Krisha pace as the full scraper
const MAX_PAGES = 100;
// Krisha shows 12 ЖК per catalog page. Far more means the parser is
// reading links that aren't search results (the ~200-link SEO footer
// once got imported as «строящиеся»).
const MAX_CARDS_PER_PAGE = 60;
// Same bounds parseAndSaveAll uses to reject non-Almaty catalog entries.
const ALMATY_BOUNDS = { minLat: 43.0, maxLat: 43.6, minLng: 76.3, maxLng: 77.6 };
// Public-map bounds (ComplexService.buildMapData) — for the "on map" stat.
const MAP_BOUNDS = { minLat: 43.0, maxLat: 43.5, minLng: 76.4, maxLng: 77.5 };

export interface ImportPageReport {
  page: number;
  // Server-clock start of this pass. The client echoes it back on every
  // following page so the last one can tell which ЖК the pass re-saw.
  since: string;
  cards: number;
  created: number;
  updated: number;
  // Cards that themselves say «сдан» despite the filter — left alone.
  skippedCompleted: number;
  hasNextPage: boolean;
  // Highest page Krisha's paginator links to — progress only.
  lastPage: number | null;
  // Last page only: ЖК flagged before but absent from this pass.
  expired: number | null;
  expirySkipped: boolean;
  newNames: string[];
}

export interface EnrichBatchReport {
  processed: number;
  updated: number;
  failed: number;
  outsideAlmaty: number;
  deleted: number;
  remaining: number;
}

export interface ConstructionStats {
  underConstruction: number;
  onMap: number;
  withCompletion: number;
  withDeveloper: number;
  pendingDetails: number;
  lastSyncAt: string | null;
  byCompletionYear: Array<{ year: number | null; count: number }>;
}

type MatchRow = Pick<
  ResidentialComplexEntity,
  "id" | "name" | "displayName" | "krishaComplexId" | "krishaUrl" | "photoUrl" |
  "isStub" | "completionYear" | "lat" | "lng" | "address" | "district" |
  "constructionCheckedAt"
>;

/**
 * Keeps the «строящиеся ЖК» part of the global catalog in sync with
 * Krisha's «Новостройки → строящийся дом» filter. Two admin-driven steps,
 * each a short synchronous request (Render kills long background work —
 * same reason enrich-batch exists):
 *
 *  1. importCatalogPage — one catalog page per call. Matches each card to
 *     a global ЖК (Krisha id, then normalised name) or creates one, and
 *     stamps it under_construction. The last page clears the flag on ЖК
 *     that dropped out of the catalog (commissioned or delisted).
 *  2. enrichBatch — a few ЖК pages per call: coordinates (+ seismic) for
 *     new rows, «Срок сдачи», developer, housing class, floors.
 */
@Injectable()
export class ConstructionSyncService {
  private readonly logger = new Logger(ConstructionSyncService.name);

  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
    private krisha: KrishaComplexParserService,
    private complexService: ComplexService,
  ) {}

  async importCatalogPage(page: number, sinceIso?: string): Promise<ImportPageReport> {
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) {
      throw new BadRequestException(`page must be 1..${MAX_PAGES}`);
    }
    const since = sinceIso ? new Date(sinceIso) : new Date();
    if (Number.isNaN(since.getTime())) throw new BadRequestException("Invalid since");

    let result: Awaited<ReturnType<KrishaComplexParserService["fetchUnderConstructionPage"]>>;
    try {
      result = await this.krisha.fetchUnderConstructionPage(page);
    } catch (err: any) {
      throw new BadGatewayException(`Krisha: ${err?.message || err}`);
    }
    // The client only asks for page N+1 after page N said there is one, so
    // an empty page is a captcha / ban / layout change — never "the end".
    // Failing here also keeps the expiry below from running on a broken pass.
    if (result.cardElements === 0) {
      throw new BadGatewayException(
        `Krisha returned no ЖК cards on ${result.url} — captcha, ban or a layout change`,
      );
    }
    if (result.cards.length > MAX_CARDS_PER_PAGE) {
      throw new BadGatewayException(
        `${result.cards.length} ЖК on ${result.url}, expected about 12 — the catalog layout changed`,
      );
    }

    const now = new Date();
    const globals = (await this.complexesRepo.find({
      where: { projectId: IsNull() },
      select: [
        "id", "name", "displayName", "krishaComplexId", "krishaUrl",
        "photoUrl", "isStub", "completionYear", "lat", "lng", "address",
        "district", "constructionCheckedAt",
      ],
    })) as MatchRow[];
    const byKrishaId = new Map<string, MatchRow>();
    const byName = new Map<string, MatchRow>();
    for (const c of globals) {
      if (c.krishaComplexId) byKrishaId.set(c.krishaComplexId, c);
      for (const key of [c.name, c.displayName]) {
        const norm = key ? this.krisha.normalizeName(key) : "";
        if (!norm) continue;
        const prev = byName.get(norm);
        // Prefer the row that already has coordinates.
        if (!prev || (!prev.lat && c.lat)) byName.set(norm, c);
      }
    }

    // A page with more to come whose every ЖК this pass already stamped is
    // page 1 again: Krisha ignored `page`, and the client would re-import
    // the same cards up to MAX_PAGES times without ever reaching the last
    // page. The last page is exempt — it may hold a single card that an
    // unstable sort order showed earlier.
    const importable = result.cards.filter((card) => card.status !== COMPLETED);
    if (
      page > 1 &&
      result.hasNextPage &&
      importable.length > 0 &&
      importable.every((card) => {
        const checked = byKrishaId.get(card.krishaComplexId)?.constructionCheckedAt;
        return checked != null && checked >= since;
      })
    ) {
      throw new BadGatewayException(
        `Page ${page} repeats ЖК already imported in this pass — Krisha ignored the page parameter`,
      );
    }

    let created = 0, updated = 0, skippedCompleted = 0;
    const newNames: string[] = [];
    for (const card of result.cards) {
      if (card.status === COMPLETED) {
        skippedCompleted++;
        continue;
      }
      const norm = this.krisha.normalizeName(card.name);
      let existing = byKrishaId.get(card.krishaComplexId);
      if (!existing && norm) {
        const named = byName.get(norm);
        // Same name but a different Krisha ЖК → a namesake, not this one.
        if (named && (!named.krishaComplexId || named.krishaComplexId === card.krishaComplexId)) {
          existing = named;
        }
      }

      if (existing) {
        const patch: ComplexPatch = {
          constructionStatus: UNDER_CONSTRUCTION,
          constructionCheckedAt: now,
        };
        if (!existing.krishaComplexId) patch.krishaComplexId = card.krishaComplexId;
        if (!existing.krishaUrl) patch.krishaUrl = card.krishaUrl;
        if (!existing.photoUrl && card.photoUrl) patch.photoUrl = card.photoUrl;
        if (!existing.address && card.address) patch.address = card.address;
        if (!existing.district && card.district) patch.district = card.district;
        // The ЖК page (enrichBatch) knows every phase; the card is only
        // a fallback until it has been read.
        if (existing.completionYear == null && card.completion) {
          patch.completionYear = card.completion.year;
          patch.completionQuarter = card.completion.quarter;
        }
        // An akimat stub now backed by a real Krisha page is no longer a
        // stub: unflagging it must clear the flag, not delete the ЖК.
        if (existing.isStub) patch.isStub = false;
        await this.complexesRepo.update(existing.id, patch);
        Object.assign(existing, patch);
        byKrishaId.set(card.krishaComplexId, existing);
        updated++;
      } else {
        const saved = await this.complexesRepo.save(
          this.complexesRepo.create({
            projectId: null as any, // global complex
            name: norm || card.name.toLowerCase(),
            displayName: card.name,
            krishaComplexId: card.krishaComplexId,
            krishaUrl: card.krishaUrl,
            photoUrl: card.photoUrl as any,
            address: card.address as any,
            district: card.district as any,
            listingsCount: 0,
            groupingMethod: "krisha_catalog",
            constructionStatus: UNDER_CONSTRUCTION,
            constructionCheckedAt: now,
            completionYear: card.completion?.year ?? null,
            completionQuarter: card.completion?.quarter ?? null,
          }),
        );
        byKrishaId.set(card.krishaComplexId, saved);
        if (norm) byName.set(norm, saved);
        created++;
        newNames.push(card.name);
      }
    }

    let expired: number | null = null;
    let expirySkipped = false;
    if (!result.hasNextPage) {
      ({ expired, expirySkipped } = await this.expireStale(since));
    }

    this.complexService.invalidateMapCache();
    this.logger.log(
      `Under-construction page ${page}: ${result.cards.length} cards, +${created} new, ${updated} updated` +
        (expired !== null ? `, ${expired} expired` : "") +
        (expirySkipped ? ", expiry skipped" : ""),
    );
    return {
      page,
      since: since.toISOString(),
      cards: result.cards.length,
      created,
      updated,
      skippedCompleted,
      hasNextPage: result.hasNextPage,
      lastPage: result.lastPage,
      expired,
      expirySkipped,
      newNames,
    };
  }

  /**
   * Clear the flag on ЖК this pass didn't see — Krisha drops a complex
   * from the «строящийся» filter once it's commissioned (or delisted).
   * Only trusted when the pass re-saw at least as many ЖК as it would
   * expire: a pass cut short by a ban must not wipe the catalog.
   */
  private async expireStale(since: Date): Promise<{ expired: number; expirySkipped: boolean }> {
    const flagged = () =>
      this.complexesRepo
        .createQueryBuilder("c")
        .where("c.projectId IS NULL")
        .andWhere("c.constructionStatus = :uc", { uc: UNDER_CONSTRUCTION });
    const seen = await flagged().andWhere("c.constructionCheckedAt >= :since", { since }).getCount();
    const stale = await flagged()
      .andWhere("(c.constructionCheckedAt IS NULL OR c.constructionCheckedAt < :since)", { since })
      .getCount();
    if (stale === 0) return { expired: 0, expirySkipped: false };
    if (seen < stale) {
      this.logger.warn(`Expiry skipped: pass saw ${seen} ЖК, ${stale} would expire`);
      return { expired: 0, expirySkipped: true };
    }
    const res = await this.complexesRepo
      .createQueryBuilder()
      .update(ResidentialComplexEntity)
      .set({ constructionStatus: null })
      .where("project_id IS NULL")
      .andWhere("construction_status = :uc", { uc: UNDER_CONSTRUCTION })
      .andWhere("(construction_checked_at IS NULL OR construction_checked_at < :since)", { since })
      .execute();
    return { expired: res.affected ?? stale, expirySkipped: false };
  }

  /**
   * Read the ЖК pages of up to `limit` under-construction ЖК whose page
   * wasn't fetched since `refreshBefore` (default: 30 days ago). Passing
   * the pass start re-reads everything once; the attempt stamp keeps the
   * loop finite either way.
   */
  async enrichBatch(limit: number, refreshBeforeIso?: string): Promise<EnrichBatchReport> {
    const refreshBefore = refreshBeforeIso
      ? new Date(refreshBeforeIso)
      : new Date(Date.now() - DETAIL_REFRESH_MS);
    if (Number.isNaN(refreshBefore.getTime())) throw new BadRequestException("Invalid refreshBefore");
    // Every attempt is stamped with server time; a cutoff in the future
    // would re-qualify rows this loop already processed and never end it.
    // Clients pass the `since` that importCatalogPage returned.
    if (refreshBefore.getTime() > Date.now()) {
      throw new BadRequestException("refreshBefore is in the future");
    }

    const pending = () =>
      this.complexesRepo
        .createQueryBuilder("c")
        .where("c.projectId IS NULL")
        .andWhere("c.constructionStatus = :uc", { uc: UNDER_CONSTRUCTION })
        .andWhere("c.krishaUrl IS NOT NULL")
        .andWhere("(c.enrichmentAttemptedAt IS NULL OR c.enrichmentAttemptedAt < :before)", {
          before: refreshBefore,
        });
    const batch = await pending()
      .orderBy("c.enrichmentAttemptedAt", "ASC", "NULLS FIRST")
      .addOrderBy("c.id", "ASC")
      .take(limit)
      .getMany();

    let updated = 0, failed = 0, outsideAlmaty = 0, deleted = 0;
    for (const c of batch) {
      await this.delay(DETAIL_DELAY_MS);
      const detail = await this.krisha.fetchComplexDetail(c.krishaUrl);
      // Stamp every attempt, failed ones included, so a dead page leaves
      // the queue instead of being retried forever.
      const patch: ComplexPatch = { enrichmentAttemptedAt: new Date() };
      if (!detail.ok) {
        failed++;
        await this.complexesRepo.update(c.id, patch);
        continue;
      }

      Object.assign(patch, constructionFieldsFromDetail(detail));

      if ((c.lat == null || c.lng == null) && detail.lat && detail.lng) {
        const inAlmaty =
          detail.lat >= ALMATY_BOUNDS.minLat && detail.lat <= ALMATY_BOUNDS.maxLat &&
          detail.lng >= ALMATY_BOUNDS.minLng && detail.lng <= ALMATY_BOUNDS.maxLng;
        if (!inAlmaty) {
          outsideAlmaty++;
          // Rows this catalog created for a non-Almaty ЖК go, exactly as
          // parseAndSaveAll never creates them. Anything carrying other
          // data (listings, akimat flag) stays, just without coordinates.
          if (c.groupingMethod === "krisha_catalog" && !c.isProblematic && !c.listingsCount) {
            await this.complexesRepo.delete(c.id);
            deleted++;
            continue;
          }
        } else {
          patch.lat = detail.lat;
          patch.lng = detail.lng;
          const seismic = findNearestFault(detail.lat, detail.lng);
          patch.seismicRiskLevel = seismic.riskLevel;
          patch.seismicDistanceMeters = Math.round(seismic.distanceMeters);
          patch.seismicConfirmedM = seismic.nearestByType.confirmed as any;
          patch.seismicStudiedM = seismic.nearestByType.poorlyStudied as any;
          patch.seismicDisputedM = seismic.nearestByType.disputed as any;
        }
      }
      if (!c.address && detail.address) patch.address = detail.address;
      if (!c.district && detail.district) patch.district = detail.district;
      // Listing-derived floors/year (if any) beat the ЖК page — fill gaps only.
      if (!c.floorsMax && detail.floorsMax) patch.floorsMax = detail.floorsMax;
      if (!c.floorSegment) {
        const segment = floorSegmentFor(patch.floorsMax ?? c.floorsMax);
        if (segment) patch.floorSegment = segment;
      }
      if (!c.yearBuilt && detail.yearBuilt) patch.yearBuilt = detail.yearBuilt;
      if (c.shutovCategory == null) {
        const shutov = findShutovRating(c.displayName || c.name);
        if (shutov) patch.shutovCategory = shutov.category;
      }

      await this.complexesRepo.update(c.id, patch);
      if (Object.keys(patch).length > 1) updated++;
    }

    const remaining = await pending().getCount();
    if (updated > 0 || deleted > 0) this.complexService.invalidateMapCache();
    return { processed: batch.length, updated, failed, outsideAlmaty, deleted, remaining };
  }

  async stats(): Promise<ConstructionStats> {
    const flagged = () =>
      this.complexesRepo
        .createQueryBuilder("c")
        .where("c.projectId IS NULL")
        .andWhere("c.constructionStatus = :uc", { uc: UNDER_CONSTRUCTION });
    const [underConstruction, onMap, withCompletion, withDeveloper, pendingDetails] = await Promise.all([
      flagged().getCount(),
      flagged()
        .andWhere("c.lat BETWEEN :minLat AND :maxLat AND c.lng BETWEEN :minLng AND :maxLng", MAP_BOUNDS)
        .getCount(),
      flagged().andWhere("c.completionYear IS NOT NULL").getCount(),
      flagged().andWhere("c.developer IS NOT NULL").getCount(),
      flagged()
        .andWhere("c.krishaUrl IS NOT NULL")
        .andWhere("(c.enrichmentAttemptedAt IS NULL OR c.enrichmentAttemptedAt < :before)", {
          before: new Date(Date.now() - DETAIL_REFRESH_MS),
        })
        .getCount(),
    ]);
    const last = await flagged().select("MAX(c.constructionCheckedAt)", "max").getRawOne();
    const years = await flagged()
      .select("c.completionYear", "year")
      .addSelect("COUNT(*)", "count")
      .groupBy("c.completionYear")
      .orderBy("c.completionYear", "ASC", "NULLS LAST")
      .getRawMany();
    return {
      underConstruction,
      onMap,
      withCompletion,
      withDeveloper,
      pendingDetails,
      lastSyncAt: last?.max ? new Date(last.max).toISOString() : null,
      byCompletionYear: years.map((r) => ({
        year: r.year == null ? null : Number(r.year),
        count: Number(r.count),
      })),
    };
  }

  /** Parse one ЖК page without saving — checks the parser against live
   *  Krisha markup. Only krisha.kz ЖК pages: the server fetches the URL. */
  async preview(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("Invalid URL");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "krisha.kz" ||
      !parsed.pathname.startsWith("/complex/show/")
    ) {
      throw new BadRequestException("Expected https://krisha.kz/complex/show/… URL");
    }
    try {
      return { url: parsed.toString(), ...(await this.krisha.inspectComplexDetail(parsed.toString())) };
    } catch (err: any) {
      throw new BadGatewayException(`Krisha: ${err?.message || err}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
