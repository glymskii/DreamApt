import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { findShutovRating, findNearestFault } from "@dreamapt/shared";
import * as cheerio from "cheerio";

const BASE_URL = "https://krisha.kz";
const ALMATY_SEARCH_URL = `${BASE_URL}/complex/search/almaty/`;
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

interface ParsedComplex {
  krishaComplexId: string;
  name: string;
  krishaUrl: string;
  priceText: string;
  state: string;
  photoUrl: string | null;
}

interface ComplexDetail {
  lat: number | null;
  lng: number | null;
  address: string | null;
  district: string | null;
  developer: string | null;
  // Floors max and year of completion. Extracted from the ЖК info table on
  // the Krisha detail page (https://krisha.kz/complex/show/almaty/...).
  // Both are nullable since the page format varies and old listings often
  // just don't expose them.
  floorsMax: number | null;
  yearBuilt: number | null;
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

  /** Parse all complexes from Krisha.kz listing pages */
  async parseComplexList(): Promise<ParsedComplex[]> {
    const allComplexes: ParsedComplex[] = [];
    const seenIds = new Set<string>();
    let page = 1;

    while (true) {
      const url = page === 1 ? ALMATY_SEARCH_URL : `${ALMATY_SEARCH_URL}?page=${page}`;
      this.logger.log(`Parsing complex list page ${page}: ${url}`);

      const html = await this.fetchPage(url);
      const $ = cheerio.load(html);

      const cards = $("[data-complex-id]");
      if (cards.length === 0) break;

      // Use a[data-complex-id] for more reliable parsing
      $("a[data-complex-id]").each((_i, el) => {
        const id = $(el).attr("data-complex-id");
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const href = $(el).attr("href") || "";
        if (!href.includes("/complex/show/")) return;

        // Extract name: try img alt first, then ЖК text pattern, then URL slug
        let name = $(el).find("img").first().attr("alt") || "";
        if (!name) {
          const allText = $(el).text();
          const jkMatch = allText.match(/ЖК\s+([^\n]+)/);
          name = jkMatch ? jkMatch[1].trim().split(/\s{2,}/)[0] : "";
        }
        if (!name) {
          const slugMatch = href.match(/\/complex\/show\/almaty\/([^/]+)/);
          if (slugMatch) name = slugMatch[1];
        }
        if (!name) return;

        const priceText = $(el).find(".complex-card__price-from, [class*=price]").first().text().trim();
        const state = $(el).find(".complex-card__state").first().text().trim();
        const photoUrl = $(el).find("img").first().attr("src") || null;

        allComplexes.push({
          krishaComplexId: id,
          name: name.replace(/^ЖК\s+/i, "").trim(),
          krishaUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
          priceText,
          state,
          photoUrl,
        });
      });

      this.logger.log(`Page ${page}: found ${cards.length} cards, total unique: ${allComplexes.length}`);

      // Check if there's a next page
      const hasNextPage = $(`a[href*="page=${page + 1}"]`).length > 0;
      if (!hasNextPage) break;

      page++;
      await this.delay(2000);
    }

    this.logger.log(`Total parsed: ${allComplexes.length} complexes from Krisha.kz`);
    return allComplexes;
  }

  /** Fetch detail page to get coordinates and address */
  async fetchComplexDetail(krishaUrl: string): Promise<ComplexDetail> {
    try {
      const html = await this.fetchPage(krishaUrl);

      // Extract coordinates from embedded script
      const latMatch = html.match(/"lat":\s*([\d.]+)/);
      const lngMatch = html.match(/"l(?:ng|on)":\s*([\d.]+)/);

      // Extract address
      const $ = cheerio.load(html);
      const addressParts: string[] = [];
      $(".complex-info__address, .complex-about__address").each((_i, el) => {
        const text = $(el).text().trim();
        if (text && !addressParts.includes(text)) addressParts.push(text);
      });

      // Extract district from address
      const allText = addressParts.join(" ");
      const districtMatch = allText.match(/(Алмалинский|Ауэзовский|Бостандыкский|Медеуский|Наурызбайский|Турксибский|Жетысуский|Алатауский)\s*р-н/i);

      // Extract developer
      const developer = $(".complex-info__developer, .developer-name, [class*=developer] a").first().text().trim();

      // Extract floors + year built. Krisha's current ЖК page format embeds
      // building meta inline in apartment listing descriptions, not in any
      // structured `complex-info__*` block. We use two robust patterns:
      //
      //   • Year: "<digits> г.п." (год постройки) e.g. "2028 г.п." appears
      //     in every apartment card's description on a given complex page.
      //     Also support legacy "Сдача дома: ...", "Год постройки: ...".
      //   • Floors: "<digits>/<digits> этаж" e.g. "4/9 этаж" — second number
      //     is the building's total floors. Take max across all matches on
      //     the page so a 25-floor tower with low-apt listings still reports
      //     correctly.

      const ALMATY_YEAR_MIN = 1950;
      const ALMATY_YEAR_MAX = new Date().getFullYear() + 5; // off-plan completion years

      // Year: scan all "<year> г.п." occurrences, take the modal one.
      const yearMatches = Array.from(html.matchAll(/(\d{4})\s*г\.\s*п\./g))
        .map((m) => parseInt(m[1], 10))
        .filter((y) => y >= ALMATY_YEAR_MIN && y <= ALMATY_YEAR_MAX);
      // Fallback: structured "Сдача дома 2024", "Год постройки 2018" — older templates.
      if (yearMatches.length === 0) {
        const fallback = html.match(/(?:Сдача дома|Сдан в|Год сдачи|Год постройки)[^<]*?(\d{4})/i);
        if (fallback) {
          const y = parseInt(fallback[1], 10);
          if (y >= ALMATY_YEAR_MIN && y <= ALMATY_YEAR_MAX) yearMatches.push(y);
        }
      }
      const yearBuilt = yearMatches.length > 0 ? this.modal(yearMatches) : null;

      // Floors: scan all "X/Y этаж" patterns, take max Y.
      const floorTotals = Array.from(html.matchAll(/\d+\s*\/\s*(\d+)\s*этаж/g))
        .map((m) => parseInt(m[1], 10))
        .filter((n) => n > 0 && n < 200);
      const floorsMax = floorTotals.length > 0 ? Math.max(...floorTotals) : null;

      return {
        lat: latMatch ? parseFloat(latMatch[1]) : null,
        lng: lngMatch ? parseFloat(lngMatch[1]) : null,
        address: addressParts[0] || null,
        district: districtMatch ? `${districtMatch[1]} р-н` : null,
        developer: developer || null,
        floorsMax,
        yearBuilt,
      };
    } catch (err) {
      this.logger.warn(`Failed to fetch detail for ${krishaUrl}: ${err}`);
      return {
        lat: null, lng: null, address: null, district: null, developer: null,
        floorsMax: null, yearBuilt: null,
      };
    }
  }

  /** Modal value (most-common). Used for yearBuilt where listings agree
   *  on "г.п." but a few stragglers report a different year. */
  private modal<T>(arr: T[]): T {
    const counts = new Map<T, number>();
    for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
    let best = arr[0], bestCount = 0;
    for (const [v, c] of counts) { if (c > bestCount) { best = v; bestCount = c; } }
    return best;
  }

  /** Normalize complex name for deduplication */
  private normalizeName(name: string): string {
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
}
