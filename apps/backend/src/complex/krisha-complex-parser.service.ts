import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { findShutovRating, findNearestFault } from "@dreamapt/shared";
import {
  parseCatalogPage,
  parseComplexDetail,
  type CatalogCard,
  type CatalogPage,
  type ComplexDetail,
  type DetailDebug,
} from "./krisha-complex-html";

const BASE_URL = "https://krisha.kz";
const ALMATY_SEARCH_URL = `${BASE_URL}/complex/search/almaty/`;
// «Квартиры в строящемся доме» — Krisha's own construction-stage filter.
const UNDER_CONSTRUCTION_FILTER = "state%5B%5D=1";
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

const EMPTY_DETAIL: ComplexDetail = {
  lat: null, lng: null, address: null, district: null, developer: null,
  floorsMax: null, yearBuilt: null, status: null, completion: null, housingClass: null,
};

/** Column patch for repository.update() — relations excluded. */
export type ComplexPatch = Partial<Omit<ResidentialComplexEntity, "project" | "properties">>;

/**
 * Detail-page fields Krisha owns outright (developer, class, «Срок сдачи»).
 * Overwrite when parsed, never blank out: a failed parse must not erase
 * data a previous fetch got right.
 */
export function constructionFieldsFromDetail(detail: ComplexDetail): ComplexPatch {
  const patch: ComplexPatch = {};
  if (detail.developer) patch.developer = detail.developer;
  if (detail.housingClass) patch.housingClass = detail.housingClass;
  if (detail.completion) {
    patch.completionYear = detail.completion.year;
    patch.completionQuarter = detail.completion.quarter;
  }
  return patch;
}

@Injectable()
export class KrishaComplexParserService {
  private readonly logger = new Logger(KrishaComplexParserService.name);

  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
  ) {}

  private async fetchPage(url: string): Promise<string> {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const res = await fetch(url, {
      headers: { "User-Agent": ua, "Accept-Language": "ru-RU,ru;q=0.9" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Fetch + parse one catalog page. */
  async fetchCatalogPage(url: string, page: number): Promise<CatalogPage> {
    return parseCatalogPage(await this.fetchPage(url), page);
  }

  /**
   * One page of the «строящийся дом» catalog. Throws when Krisha didn't
   * apply the filter (heading no longer says «строящ…»): every card would
   * otherwise be flagged as under construction, finished buildings included.
   */
  async fetchUnderConstructionPage(page: number): Promise<CatalogPage & { url: string }> {
    const url = `${ALMATY_SEARCH_URL}?${UNDER_CONSTRUCTION_FILTER}${page > 1 ? `&page=${page}` : ""}`;
    const result = await this.fetchCatalogPage(url, page);
    if (result.cardElements > 0 && !/строящ/i.test(result.heading)) {
      throw new Error(
        `under-construction filter not applied on ${url} (heading: "${result.heading.slice(0, 120)}")`,
      );
    }
    return { ...result, url };
  }

  /** Parse all complexes from Krisha.kz listing pages */
  async parseComplexList(): Promise<CatalogCard[]> {
    const allComplexes: CatalogCard[] = [];
    const seenIds = new Set<string>();
    let page = 1;

    while (true) {
      const url = page === 1 ? ALMATY_SEARCH_URL : `${ALMATY_SEARCH_URL}?page=${page}`;
      this.logger.log(`Parsing complex list page ${page}: ${url}`);

      const { cards, cardElements, hasNextPage } = await this.fetchCatalogPage(url, page);
      if (cardElements === 0) break;

      for (const card of cards) {
        if (seenIds.has(card.krishaComplexId)) continue;
        seenIds.add(card.krishaComplexId);
        allComplexes.push(card);
      }

      this.logger.log(`Page ${page}: found ${cardElements} cards, total unique: ${allComplexes.length}`);

      if (!hasNextPage) break;

      page++;
      await this.delay(2000);
    }

    this.logger.log(`Total parsed: ${allComplexes.length} complexes from Krisha.kz`);
    return allComplexes;
  }

  /** Fetch detail page to get coordinates, address, building meta and
   *  construction fields. `ok` is false when the page couldn't be fetched
   *  (all fields null) as opposed to fetched-but-empty. */
  async fetchComplexDetail(krishaUrl: string): Promise<ComplexDetail & { ok: boolean }> {
    try {
      const { labeled: _labeled, ...detail } = parseComplexDetail(await this.fetchPage(krishaUrl));
      return { ...detail, ok: true };
    } catch (err) {
      this.logger.warn(`Failed to fetch detail for ${krishaUrl}: ${err}`);
      return { ...EMPTY_DETAIL, ok: false };
    }
  }

  /** Detail parse plus the raw label candidates — admin preview only.
   *  Unlike fetchComplexDetail, fetch errors propagate to the caller. */
  async inspectComplexDetail(krishaUrl: string): Promise<ComplexDetail & DetailDebug> {
    return parseComplexDetail(await this.fetchPage(krishaUrl));
  }

  /** Normalize complex name for deduplication */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/["'«»""]/g, "")
      .replace(/\bжк\b/gi, "")
      .replace(/\bж\.к\.\b/gi, "")
      .replace(/[^a-zа-яёғқңүұһі0-9\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Parse all Almaty complexes and save to DB */
  async parseAndSaveAll(): Promise<{ created: number; updated: number; skipped: number }> {
    const parsed = await this.parseComplexList();
    let created = 0, updated = 0, skipped = 0;

    for (let i = 0; i < parsed.length; i++) {
      const pc = parsed[i];
      this.logger.log(`[${i + 1}/${parsed.length}] Processing: ${pc.name}`);

      // Check if already exists by krishaComplexId
      let existing = await this.complexesRepo.findOne({
        where: { krishaComplexId: pc.krishaComplexId },
      });

      // Also check by normalized name (for complexes created from search results)
      if (!existing) {
        const norm = this.normalizeName(pc.name);
        const byName = await this.complexesRepo
          .createQueryBuilder("c")
          .where("LOWER(c.name) = :name", { name: norm })
          .andWhere("c.projectId IS NULL")
          .getOne();
        if (byName) existing = byName;
      }

      if (existing && existing.lat && existing.lng) {
        // Already has coords — only fetch the detail page when we still
        // need data from it (floors/year were added in a later schema bump,
        // so older rows have NULL even though everything else is enriched).
        const needsDetail = !existing.floorsMax || !existing.yearBuilt;
        if (!needsDetail && !existing.krishaComplexId) {
          // Just stamp the krisha id/url without scraping
          existing.krishaComplexId = pc.krishaComplexId;
          existing.krishaUrl = pc.krishaUrl;
          if (pc.photoUrl && !existing.photoUrl) existing.photoUrl = pc.photoUrl;
          await this.complexesRepo.save(existing);
          updated++;
          continue;
        }
        if (!needsDetail) {
          skipped++;
          continue;
        }
        // Fall through into the detail-fetch block below to backfill
        // floors/year. Skip seismic/shutov/lat/lng — already populated.
        await this.delay(1500);
        const detail = await this.fetchComplexDetail(pc.krishaUrl);
        if (!existing.krishaComplexId) existing.krishaComplexId = pc.krishaComplexId;
        if (!existing.krishaUrl) existing.krishaUrl = pc.krishaUrl;
        if (!existing.floorsMax && detail.floorsMax) existing.floorsMax = detail.floorsMax;
        if (!existing.yearBuilt && detail.yearBuilt) existing.yearBuilt = detail.yearBuilt;
        if (!existing.photoUrl && pc.photoUrl) existing.photoUrl = pc.photoUrl;
        Object.assign(existing, constructionFieldsFromDetail(detail));
        await this.complexesRepo.save(existing);
        updated++;
        continue;
      }

      // Fetch detail page for coordinates
      await this.delay(1500);
      const detail = await this.fetchComplexDetail(pc.krishaUrl);

      // Verify this is actually in Almaty (lat ~43.1-43.5, lng ~76.5-77.5)
      if (detail.lat && detail.lng) {
        if (detail.lat < 43.0 || detail.lat > 43.6 || detail.lng < 76.3 || detail.lng > 77.6) {
          this.logger.warn(`Skipping ${pc.name} — coordinates outside Almaty: ${detail.lat}, ${detail.lng}`);
          skipped++;
          continue;
        }
      }

      // Seismic & Shutov
      let seismicRiskLevel: string | null = null;
      let seismicDistanceMeters: number | null = null;
      let shutovCategory: number | null = null;

      if (detail.lat && detail.lng) {
        const seismic = findNearestFault(detail.lat, detail.lng);
        seismicRiskLevel = seismic.riskLevel;
        seismicDistanceMeters = Math.round(seismic.distanceMeters);
      }

      const shutov = findShutovRating(pc.name);
      if (shutov) shutovCategory = shutov.category;

      if (existing) {
        // Update existing — only set fields that we have new values for, so
        // we don't overwrite floors/year previously aggregated from listings.
        existing.krishaComplexId = pc.krishaComplexId;
        existing.krishaUrl = pc.krishaUrl;
        if (detail.lat) existing.lat = detail.lat as any;
        if (detail.lng) existing.lng = detail.lng as any;
        if (detail.address) existing.address = detail.address;
        if (detail.district) existing.district = detail.district;
        if (pc.photoUrl) existing.photoUrl = pc.photoUrl;
        if (seismicRiskLevel) existing.seismicRiskLevel = seismicRiskLevel;
        if (seismicDistanceMeters) existing.seismicDistanceMeters = seismicDistanceMeters;
        if (shutovCategory !== null) existing.shutovCategory = shutovCategory;
        // Only fill in floors/year if they're missing — search-aggregated
        // values from real listings are more trustworthy than the static
        // ЖК page (which sometimes shows planned floors that differ from
        // what was actually built).
        if (!existing.floorsMax && detail.floorsMax) {
          existing.floorsMax = detail.floorsMax;
        }
        if (!existing.yearBuilt && detail.yearBuilt) {
          existing.yearBuilt = detail.yearBuilt;
        }
        Object.assign(existing, constructionFieldsFromDetail(detail));
        await this.complexesRepo.save(existing);
        updated++;
      } else {
        // Create new global complex
        const entity = this.complexesRepo.create({
          projectId: null as any, // Global complex
          name: this.normalizeName(pc.name),
          displayName: pc.name,
          krishaComplexId: pc.krishaComplexId,
          krishaUrl: pc.krishaUrl,
          lat: detail.lat as any,
          lng: detail.lng as any,
          address: detail.address as any,
          district: detail.district as any,
          photoUrl: pc.photoUrl as any,
          seismicRiskLevel: seismicRiskLevel as any,
          seismicDistanceMeters: seismicDistanceMeters as any,
          shutovCategory: shutovCategory as any,
          floorsMax: detail.floorsMax as any,
          yearBuilt: detail.yearBuilt as any,
          ...constructionFieldsFromDetail(detail),
          listingsCount: 0,
          groupingMethod: "krisha_catalog",
        });
        await this.complexesRepo.save(entity);
        created++;
      }
    }

    this.logger.log(`Parse complete: created=${created}, updated=${updated}, skipped=${skipped}`);
    return { created, updated, skipped };
  }

  /**
   * Synchronous chunked enrichment for ЖК that already have a krishaUrl in
   * the DB. Caller drives a loop: pass `offset`, get back N updates, repeat
   * until `processed === 0`. This bypasses Render's background-task
   * unreliability — the work happens inside one HTTP request and completes
   * (or doesn't) within the request's lifetime.
   *
   * Targets ЖК that are missing yearBuilt OR floorsMax. Each batch fetches
   * a few detail pages with our usual rate limit and updates the rows.
   */
  async enrichChunk(
    limit: number,
    offset: number,
  ): Promise<{
    processed: number;
    updated: number;
    skipped: number;
    remaining: number;
    nextOffset: number;
  }> {
    // Find candidates that need enrichment OR have suspicious values.
    //   • yearBuilt out of [1950, currentYear+5] → almost certainly junk
    //     (parser caught a price, area, or apartment count)
    //   • floorsMax > 50 → no Almaty residential complex is that tall;
    //     Esentai Tower at 37 is the actual top of the city
    // Such rows get re-fetched and overwritten with fresh, regex-validated
    // values (or NULL if nothing parses, which is better than wrong data).
    const SUSPICIOUS_FLOORS_THRESHOLD = 50;
    const SUSPICIOUS_YEAR_MAX = new Date().getFullYear() + 5;
    // Don't re-attempt the same ЖК within this window — pages that have no
    // apartment cards (off-plan, recently delisted) won't suddenly start
    // returning data, so we'd just spin in a loop.
    const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = new Date(Date.now() - RETRY_WINDOW_MS);

    const filter = `
      c.krishaUrl IS NOT NULL
      AND (
        c.yearBuilt IS NULL
        OR c.floorsMax IS NULL
        OR c.floorsMax > :flMax
        OR c.yearBuilt < 1950
        OR c.yearBuilt > :yrMax
      )
      AND (c.enrichmentAttemptedAt IS NULL OR c.enrichmentAttemptedAt < :cutoff)
    `;
    const filterParams = {
      flMax: SUSPICIOUS_FLOORS_THRESHOLD,
      yrMax: SUSPICIOUS_YEAR_MAX,
      cutoff,
    };

    const candidates = await this.complexesRepo
      .createQueryBuilder("c")
      .where(filter, filterParams)
      .orderBy("c.id", "ASC")
      .skip(offset)
      .take(limit)
      .getMany();

    const totalRemaining = await this.complexesRepo
      .createQueryBuilder("c")
      .where(filter, filterParams)
      .getCount();

    let updated = 0;
    let skipped = 0;

    const isJunkFloors = (n: number | null) =>
      n != null && (n < 1 || n > SUSPICIOUS_FLOORS_THRESHOLD);
    const isJunkYear = (y: number | null) =>
      y != null && (y < 1950 || y > SUSPICIOUS_YEAR_MAX);

    for (const c of candidates) {
      try {
        await this.delay(1500); // same gentle Krisha pace as the full scraper
        const detail = await this.fetchComplexDetail(c.krishaUrl);
        // Always stamp the attempt — pages with no apartment cards return no
        // data, so we mark them tried and move on. Without this stamp the
        // filter picks them up again next iteration → infinite loop.
        const patch: Record<string, unknown> = {
          enrichmentAttemptedAt: new Date(),
        };

        // For yearBuilt: write the parsed value if we found one. If existing
        // is junk and detail is null, null it out (better than keeping junk).
        // If existing is null and detail is null, leave alone — no need to
        // write null over null.
        if (isJunkYear(c.yearBuilt) && detail.yearBuilt === null) {
          patch.yearBuilt = null;
        } else if (detail.yearBuilt !== null && (!c.yearBuilt || isJunkYear(c.yearBuilt))) {
          patch.yearBuilt = detail.yearBuilt;
        }

        if (isJunkFloors(c.floorsMax) && detail.floorsMax === null) {
          patch.floorsMax = null;
        } else if (detail.floorsMax !== null && (!c.floorsMax || isJunkFloors(c.floorsMax))) {
          patch.floorsMax = detail.floorsMax;
        }

        // Same page also carries developer / class / «Срок сдачи» — keep
        // them, so the under-construction sync needn't re-fetch it.
        Object.assign(patch, constructionFieldsFromDetail(detail));

        await this.complexesRepo.update(c.id, patch);
        // Count as "updated" only when we actually changed year or floors;
        // pure timestamp bumps are skips from the user's perspective.
        if ("yearBuilt" in patch || "floorsMax" in patch) {
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.warn(`enrichChunk: failed for ${c.id} (${c.krishaUrl}): ${err}`);
        // Stamp the attempt anyway so a permanent fetch failure (404,
        // gone, etc.) doesn't keep this row in the queue forever.
        await this.complexesRepo
          .update(c.id, { enrichmentAttemptedAt: new Date() })
          .catch(() => {});
        skipped++;
      }
    }

    return {
      processed: candidates.length,
      updated,
      skipped,
      remaining: Math.max(0, totalRemaining - candidates.length),
      nextOffset: offset + candidates.length,
    };
  }
}
