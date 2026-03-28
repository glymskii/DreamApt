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
  type: "building" | "branch" | string;
  name: string;
  reviews?: { general_rating: number; general_review_count: number };
  address_name?: string;
  building_name?: string;
  full_name?: string;
  rubrics?: { name: string }[];
}

const TWOGIS_KEY = "rubnkm7490"; // Public demo key
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
   * Strategy:
   *   1. Search catalog (both buildings and branches) — get rating, address, item ID & type
   *   2. Fetch reviews using the correct endpoint:
   *      - building → /geo/{buildingId}/reviews
   *      - branch  → /branches/{branchId}/reviews
   *   3. If building reviews are empty, try finding a branch and vice versa
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

      // Step 1: Search catalog for the complex (any type)
      const catalogResult = await this.searchCatalog(query);
      if (!catalogResult) return null;

      // Step 2: Fetch reviews using the best available method
      let reviews: TwoGisReview[] = [];

      // Try building reviews first (most ЖК are listed as buildings)
      if (catalogResult.buildingId) {
        reviews = await this.fetchReviews("geo", catalogResult.buildingId);
        if (reviews.length > 0) {
          this.logger.log(
            `Fetched ${reviews.length} building reviews for "${query}" (building: ${catalogResult.buildingId})`,
          );
        }
      }

      // If no building reviews, try branch reviews
      if (reviews.length === 0 && catalogResult.branchId) {
        reviews = await this.fetchReviews("branches", catalogResult.branchId);
        if (reviews.length > 0) {
          this.logger.log(
            `Fetched ${reviews.length} branch reviews for "${query}" (branch: ${catalogResult.branchId})`,
          );
        }
      }

      // If still nothing, try finding a branch via separate search
      if (reviews.length === 0) {
        const branchId = await this.findBranchId(query);
        if (branchId) {
          reviews = await this.fetchReviews("branches", branchId);
          if (reviews.length > 0) {
            this.logger.log(
              `Fetched ${reviews.length} branch reviews for "${query}" (found branch: ${branchId})`,
            );
          }
        }
      }

      return {
        complexName: catalogResult.complexName,
        totalReviews: catalogResult.totalReviews,
        averageRating: catalogResult.averageRating,
        twogisUrl: catalogResult.twogisUrl,
        address: catalogResult.address,
        buildingName: catalogResult.buildingName,
        reviews,
      };
    } catch (err) {
      this.logger.error(`Failed to get 2GIS data for ${complexName}: ${err}`);
      return null;
    }
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
   * Search the catalog for complex info (rating, address, name) and extract IDs
   */
  private async searchCatalog(
    query: string,
  ): Promise<
    | (Omit<TwoGisReviewsResult, "reviews"> & {
        buildingId: string | null;
        branchId: string | null;
      })
    | null
  > {
    const searches = [
      `ЖК ${query} Алматы`,
      `${query} жилой комплекс Алматы`,
      `${query} Алматы`,
    ];

    for (const searchText of searches) {
      const result = await this.searchCatalogOnce(searchText, query);
      if (result) return result;
    }

    return null;
  }

  private async searchCatalogOnce(
    searchText: string,
    originalQuery: string,
  ): Promise<
    | (Omit<TwoGisReviewsResult, "reviews"> & {
        buildingId: string | null;
        branchId: string | null;
      })
    | null
  > {
    try {
      const url = `https://catalog.api.2gis.com/3.0/items?q=${encodeURIComponent(searchText)}&fields=items.reviews&key=${TWOGIS_KEY}`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      const items: CatalogItem[] = data.result?.items;
      if (!items?.length) return null;

      const queryNorm = this.normalize(originalQuery);
      const relevantItems = items.filter((i) => {
        const name = this.normalize(i.name || "");
        const buildingName = this.normalize(i.building_name || "");
        const fullName = this.normalize(i.full_name || "");
        return (
          name.includes(queryNorm) ||
          buildingName.includes(queryNorm) ||
          fullName.includes(queryNorm) ||
          queryNorm.includes(
            name
              .replace(/,?\s*(строящийся )?жилой комплекс.*$/i, "")
              .trim(),
          )
        );
      });

      if (relevantItems.length === 0) return null;

      // Pick the best item for rating info (most reviews)
      const item =
        relevantItems.find(
          (i) =>
            i.type === "branch" &&
            (i.reviews?.general_review_count || 0) > 0,
        ) ||
        relevantItems
          .filter((i) => (i.reviews?.general_review_count || 0) > 0)
          .sort(
            (a, b) =>
              (b.reviews?.general_review_count || 0) -
              (a.reviews?.general_review_count || 0),
          )[0] ||
        relevantItems[0];

      const rating = item.reviews?.general_rating || 0;
      const reviewCount = item.reviews?.general_review_count || 0;

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

      // Extract IDs by type
      let buildingId: string | null = null;
      let branchId: string | null = null;

      // From current item
      const numericId = this.extractNumericId(item.id);
      if (item.type === "building" && numericId) {
        buildingId = numericId;
      } else if (item.type === "branch" && numericId) {
        branchId = numericId;
      }

      // Also try to find the other type from relevant items
      if (!buildingId) {
        const building = relevantItems.find(
          (i) =>
            i.type === "building" &&
            (i.reviews?.general_review_count || 0) > 0,
        );
        if (building) {
          buildingId = this.extractNumericId(building.id);
        }
      }
      if (!branchId) {
        const branch = relevantItems.find(
          (i) =>
            i.type === "branch" &&
            (i.reviews?.general_review_count || 0) > 0,
        );
        if (branch) {
          branchId = this.extractNumericId(branch.id);
        }
      }

      return {
        complexName: buildingLabel,
        totalReviews: reviewCount,
        averageRating: rating,
        twogisUrl: `https://2gis.kz/almaty/search/${searchTerm}`,
        address: item.address_name || "",
        buildingName: buildingLabel,
        buildingId,
        branchId,
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
   * @param type "geo" for buildings, "branches" for organizations
   * @param id numeric ID
   */
  private async fetchReviews(
    type: "geo" | "branches",
    id: string,
  ): Promise<TwoGisReview[]> {
    try {
      const url = `https://api.reviews.2gis.com/2.0/${type}/${id}/reviews?limit=10&sort_by=date_created&sort_direction=desc`;

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
        .filter((r: any) => r.text && r.text.trim().length > 5)
        .slice(0, 8)
        .map((r: any) => ({
          id: r.id || "",
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
