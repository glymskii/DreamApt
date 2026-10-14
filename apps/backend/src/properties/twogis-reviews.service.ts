import { Injectable, Logger } from "@nestjs/common";

export interface TwoGisReview {
  id: string;
  rating: number;
  text: string;
  userName: string;
  dateCreated: string;
  likesCount: number;
  photosCount: number;
  photoUrls: string[];
  officialAnswer?: {
    text: string;
    orgName: string;
    dateCreated: string;
  };
}

export interface TwoGisReviewsResult {
  complexName: string;
  totalReviews: number;
  averageRating: number;
  twogisUrl: string | null;
  address: string;
  buildingName: string;
  reviews: TwoGisReview[];
}

interface CatalogItem {
  id: string;
  /** "adm_div" (subtype "place") is 2GIS's newer object for a whole ЖК. */
  type: "building" | "branch" | "adm_div" | string;
  name: string;
  reviews?: { general_rating: number; general_review_count: number };
  address_name?: string;
  building_name?: string;
  full_name?: string;
  rubrics?: { name: string }[];
  point?: { lat: number; lon: number };
}

/** Where a ЖК's reviews live: its organisation, its buildings, its area. */
interface ReviewSource {
  kind: "geo" | "branches";
  id: string;
}

type CatalogMatch = Omit<TwoGisReviewsResult, "reviews"> & { sources: ReviewSource[] };

const TWOGIS_KEY = "rubnkm7490"; // Public demo key
/** Object types whose reviews the Reviews API serves. */
const REVIEWABLE_TYPES = ["branch", "building", "adm_div"];
/** Cap on objects read per ЖК: bounds API calls per card. */
const MAX_SOURCES = 4;
/** Same-named objects farther than this from the ЖК belong to another one. */
const MAX_DISTANCE_KM = 3;
const MAX_REVIEWS = 8;
const REVIEWS_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Origin: "https://2gis.kz",
  Referer: "https://2gis.kz/",
};

@Injectable()
export class TwoGisReviewsService {
  private readonly logger = new Logger(TwoGisReviewsService.name);

  /**
   * Search for a residential complex on 2GIS and return rating + actual reviews.
   *
   * One ЖК is several 2GIS objects: the developer's sales office (branch),
   * each building, and lately the complex itself as an area (adm_div). New
   * reviews land on any of them, so reading just one shows a stale, partial
   * picture. We read every object that matches the name and has reviews,
   * then merge newest first.
   */
  async getReviews(
    complexName: string,
    lat?: number,
    lng?: number,
  ): Promise<TwoGisReviewsResult | null> {
    if (!complexName) return null;

    try {
      const query = complexName
        .replace(/^ЖК\s+/i, "")
        .replace(/жилой комплекс/i, "")
        .trim();

      const near = lat != null && lng != null ? { lat, lng } : undefined;
      const match = await this.searchCatalog(query, near);
      if (!match) return null;

      let reviews = this.mergeReviews(
        await Promise.all(match.sources.map((s) => this.fetchReviews(s.kind, s.id))),
      );

      // Last resort: an organisation the main search didn't surface.
      if (reviews.length === 0) {
        const branchId = await this.findBranchId(query);
        if (branchId) reviews = this.mergeReviews([await this.fetchReviews("branches", branchId)]);
      }
      this.logger.log(
        `2GIS "${query}": ${reviews.length} reviews from ${match.sources.length} objects`,
      );

      const { sources: _sources, ...meta } = match;
      return { ...meta, reviews };
    } catch (err) {
      this.logger.error(`Failed to get 2GIS data for ${complexName}: ${err}`);
      return null;
    }
  }

  /** Newest first, each review once. */
  private mergeReviews(lists: TwoGisReview[][]): TwoGisReview[] {
    const seen = new Set<string>();
    return lists
      .flat()
      .filter((r) => !seen.has(r.id) && seen.add(r.id))
      .sort((a, b) => (Date.parse(b.dateCreated) || 0) - (Date.parse(a.dateCreated) || 0))
      .slice(0, MAX_REVIEWS);
  }

  /**
   * Normalize text for fuzzy matching: lowercase, collapse whitespace, normalize dashes
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s*[-–—]\s*/g, "-") // normalize dashes and surrounding spaces
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * The complex's name with 2GIS's decorations removed: «Magnit Alatau,
   * строящийся жилой комплекс» and «Жилой комплекс Magnit Alatau» both
   * become «magnit alatau».
   */
  private label(text: string): string {
    return this.normalize(text)
      .replace(/[«»"]/g, "")
      .replace(/^(жк|(строящийся )?жилой комплекс)\s+/, "")
      .replace(/,?\s*(строящийся )?жилой комплекс.*$/, "")
      .trim();
  }

  /**
   * Catalog items that are this ЖК. An exact name match wins: «Alatau City
   * 2.0» must not pull in «Alatau City». Only without one do we accept a
   * name that contains the other. With the ЖК's coordinates, objects
   * farther than MAX_DISTANCE_KM are a same-named complex elsewhere.
   */
  private matchingItems(
    items: CatalogItem[],
    query: string,
    near?: { lat: number; lng: number },
  ): CatalogItem[] {
    const q = this.label(query);
    if (!q) return [];
    const candidates = items.filter(
      (i) =>
        REVIEWABLE_TYPES.includes(i.type) &&
        (!near || !i.point || this.distanceKm(near, i.point) <= MAX_DISTANCE_KM),
    );
    const labels = (i: CatalogItem) =>
      [i.name, i.building_name].filter((t): t is string => !!t).map((t) => this.label(t));

    const exact = candidates.filter((i) => labels(i).includes(q));
    if (exact.length > 0) return exact;
    return candidates.filter(
      (i) =>
        labels(i).some((l) => l.length >= 3 && (l.includes(q) || q.includes(l))) ||
        this.normalize(i.full_name || "").includes(q),
    );
  }

  /**
   * Search the catalog for the complex: rating, address and every object
   * that holds its reviews.
   */
  private async searchCatalog(
    query: string,
    near?: { lat: number; lng: number },
  ): Promise<CatalogMatch | null> {
    const searches = [
      `ЖК ${query} Алматы`,
      `${query} жилой комплекс Алматы`,
      `${query} Алматы`,
    ];

    for (const searchText of searches) {
      const result = await this.searchCatalogOnce(searchText, query, near);
      if (result) return result;
    }

    return null;
  }

  private async searchCatalogOnce(
    searchText: string,
    originalQuery: string,
    near?: { lat: number; lng: number },
  ): Promise<CatalogMatch | null> {
    try {
      const url = `https://catalog.api.2gis.com/3.0/items?q=${encodeURIComponent(searchText)}&fields=items.reviews,items.point&key=${TWOGIS_KEY}`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        this.logger.warn(`2GIS catalog returned ${res.status} for "${searchText}"`);
        return null;
      }
      const data = await res.json();
      const items: CatalogItem[] = data.result?.items;
      if (!items?.length) return null;

      const relevantItems = this.matchingItems(items, originalQuery, near);
      if (relevantItems.length === 0) return null;

      const count = (i: CatalogItem) => i.reviews?.general_review_count || 0;
      const reviewed = relevantItems.filter((i) => count(i) > 0).sort((a, b) => count(b) - count(a));
      // The object with most reviews names the card; the rating covers all.
      const item = reviewed[0] || relevantItems[0];
      const reviewCount = reviewed.reduce((sum, i) => sum + count(i), 0);
      const rating =
        reviewCount > 0
          ? reviewed.reduce((sum, i) => sum + (i.reviews?.general_rating || 0) * count(i), 0) / reviewCount
          : 0;

      const buildingLabel =
        item.building_name || item.name || originalQuery;
      const cleanLabel = buildingLabel
        .replace(/,?\s*строящийся жилой комплекс$/i, "")
        .replace(/,?\s*жилой комплекс$/i, "")
        .replace(/^жилой комплекс\s+/i, "")
        .replace(/^строящийся жилой комплекс\s+/i, "")
        .trim();

      const searchTerm = encodeURIComponent(
        cleanLabel + " жилой комплекс Алматы",
      );

      const sources = reviewed.slice(0, MAX_SOURCES).flatMap((i): ReviewSource[] => {
        const id = this.extractNumericId(i.id);
        return id ? [{ kind: i.type === "branch" ? "branches" : "geo", id }] : [];
      });

      return {
        complexName: buildingLabel,
        totalReviews: reviewCount,
        averageRating: rating,
        twogisUrl: `https://2gis.kz/almaty/search/${searchTerm}`,
        address: item.address_name || "",
        buildingName: buildingLabel,
        sources,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find a branch ID (organization) for a complex via separate search.
   * Fallback for when the main catalog search only returned buildings.
   */
  private async findBranchId(query: string): Promise<string | null> {
    const searches = [
      `${query} жилой комплекс Алматы`,
      `ЖК ${query} Алматы`,
      `${query} Алматы`,
    ];

    for (const searchText of searches) {
      try {
        const url = `https://catalog.api.2gis.com/3.0/items?q=${encodeURIComponent(searchText)}&fields=items.reviews,items.rubrics&type=branch&key=${TWOGIS_KEY}`;

        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        if (!res.ok) continue;
        const data = await res.json();
        const items = data.result?.items;
        if (!items?.length) continue;

        // Find a branch that is a ЖК by rubrics or name
        const jkBranch = items.find((i: any) => {
          const name = (i.name || "").toLowerCase();
          const rubricNames = (i.rubrics || []).map(
            (r: any) => (r.name || "").toLowerCase(),
          );
          const isJK =
            name.includes("жилой комплекс") ||
            name.includes("жк ") ||
            rubricNames.some(
              (rn: string) =>
                rn.includes("новостройк") ||
                rn.includes("жилой комплекс") ||
                rn.includes("застройщик") ||
                rn.includes("жилищн"),
            );
          return isJK && (i.reviews?.general_review_count || 0) > 0;
        });

        if (jkBranch) {
          const branchId = this.extractNumericId(jkBranch.id);
          if (branchId) {
            this.logger.debug(
              `Found branch for "${query}": ${jkBranch.name} (${branchId})`,
            );
            return branchId;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /** Equirectangular distance; plenty for a few km inside one city. */
  private distanceKm(a: { lat: number; lng: number }, b: { lat: number; lon: number }): number {
    const x = (b.lon - a.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    return Math.hypot(x, b.lat - a.lat) * 111.32;
  }

  /**
   * Extract numeric ID prefix from the full 2GIS item ID
   */
  private extractNumericId(fullId: string): string | null {
    if (!fullId) return null;
    const match = fullId.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Fetch reviews from 2GIS Reviews API.
   * @param type "geo" for buildings and ЖК areas, "branches" for organizations
   * @param id numeric ID
   */
  private async fetchReviews(
    type: "geo" | "branches",
    id: string,
  ): Promise<TwoGisReview[]> {
    try {
      // Rating-only reviews are dropped below, so ask for more than we show.
      const url = `https://api.reviews.2gis.com/2.0/${type}/${id}/reviews?limit=20&sort_by=date_created&sort_direction=desc`;

      const res = await fetch(url, { headers: REVIEWS_HEADERS });

      if (!res.ok) {
        this.logger.warn(
          `2GIS Reviews API (${type}/${id}) returned ${res.status}`,
        );
        return [];
      }

      const data = await res.json();
      const rawReviews = data.reviews || [];

      return rawReviews
        .filter((r: any) => r.id && r.text && r.text.trim().length > 5)
        .slice(0, MAX_REVIEWS)
        .map((r: any) => ({
          id: String(r.id),
          rating: r.rating || 0,
          text: r.text || "",
          userName: r.user?.name || "Пользователь",
          dateCreated: r.date_created || "",
          likesCount: r.likes_count || 0,
          photosCount: (r.photos || []).length,
          photoUrls: (r.photos || [])
            .slice(0, 3)
            .map(
              (p: any) =>
                p.preview_urls?.["640x"] || p.preview_urls?.url || "",
            )
            .filter(Boolean),
          officialAnswer: r.official_answer
            ? {
                text: r.official_answer.text || "",
                orgName: r.official_answer.org_name || "",
                dateCreated: r.official_answer.date_created || "",
              }
            : undefined,
        }));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch reviews (${type}/${id}): ${err}`,
      );
      return [];
    }
  }
}
