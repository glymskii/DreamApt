import { Injectable, Logger } from "@nestjs/common";
import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";

const RATE_LIMIT_MS = parseInt(process.env.KRISHA_RATE_LIMIT_MS || "3000");
const MAX_PAGES = parseInt(process.env.KRISHA_MAX_PAGES || "3");
const MAX_DETAILS = parseInt(process.env.KRISHA_MAX_DETAILS || "20");

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
];

export interface KrishaListingItem {
  krishaId: string;
  krishaUrl: string;
  title: string;
  price: number;
  rooms: number;
  areaTotal: number;
  district: string;
  photoThumb: string;
}

export interface KrishaPropertyDetail {
  krishaId: string;
  krishaUrl: string;
  title: string;
  price: number;
  rooms: number;
  areaTotal: number;
  areaLiving: number;
  areaKitchen: number;
  floor: number;
  floorTotal: number;
  buildingType: string;
  yearBuilt: number | null;
  condition: string;
  district: string;
  address: string;
  complexName: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  sellerType: string;
  photos: string[];
  description: string;
}

// Map our district keys to Krisha.kz URL path segments
// Krisha uses path-based filtering: /prodazha/kvartiry/almaty-bostandykskij/
const DISTRICT_MAP: Record<string, string> = {
  almaly: "almalinskij",
  auezov: "auezovskij",
  bostandyk: "bostandykskij",
  medeu: "medeuski",
  nauryzbay: "nauryzbajskij",
  turksib: "turksibskij",
  zhetysu: "zhetysuski",
  alatau: "alatauski",
};

@Injectable()
export class KrishaParserService {
  private readonly logger = new Logger(KrishaParserService.name);
  private limiter: Bottleneck;

  constructor() {
    this.limiter = new Bottleneck({
      minTime: RATE_LIMIT_MS,
      maxConcurrent: 1,
    });
  }

  private getRandomUA(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    return this.limiter.schedule(async () => {
      this.logger.log(`Fetching: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.getRandomUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          Referer: "https://krisha.kz/",
        },
      });

      if (!res.ok) {
        throw new Error(`Krisha returned ${res.status} for ${url}`);
      }

      const html = await res.text();
      return cheerio.load(html);
    });
  }

  /**
   * Build search URL for a SINGLE district.
   * Krisha.kz uses path-based district filtering: /prodazha/kvartiry/almaty-bostandykskij/
   * Query param das[map.district] does NOT work — Krisha ignores it.
   */
  buildSearchUrl(params: {
    rooms?: number[];
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    district?: string; // single district path segment (e.g. "bostandykskij")
    page?: number;
  }): string {
    const districtPath = params.district ? `-${params.district}` : "";
    const base = `https://krisha.kz/prodazha/kvartiry/almaty${districtPath}/`;
    const queryParts: string[] = [];

    if (params.rooms?.length) {
      queryParts.push(`das[live.rooms]=${params.rooms.join("-")}`);
    }
    if (params.priceMin) {
      queryParts.push(`das[price][from]=${params.priceMin}`);
    }
    if (params.priceMax) {
      queryParts.push(`das[price][to]=${params.priceMax}`);
    }
    if (params.areaMin) {
      queryParts.push(`das[live.square][from]=${params.areaMin}`);
    }
    if (params.areaMax) {
      queryParts.push(`das[live.square][to]=${params.areaMax}`);
    }
    if (params.page && params.page > 1) {
      queryParts.push(`page=${params.page}`);
    }

    // Only with photos
    queryParts.push("das[_sys.hasphoto]=1");

    return `${base}?${queryParts.join("&")}`;
  }

  /**
   * Parse interview answers into Krisha search params
   */
  interviewToSearchParams(answers: Record<string, unknown>): {
    rooms?: number[];
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    districts?: string[];
  } {
    const params: any = {};

    if (answers.rooms) {
      params.rooms = Array.isArray(answers.rooms) ? answers.rooms : [answers.rooms];
    }
    if (answers.budgetMin) {
      params.priceMin = answers.budgetMin as number;
    }
    if (answers.budgetMax) {
      params.priceMax = answers.budgetMax as number;
    }
    if (answers.areaMin) {
      params.areaMin = answers.areaMin as number;
    }
    if (answers.areaMax) {
      params.areaMax = answers.areaMax as number;
    }
    if (answers.districts) {
      params.districts = answers.districts as string[];
    }

    return params;
  }

  /**
   * Scrape listing pages and return brief listing items.
   * Makes separate requests per district since Krisha uses path-based filtering.
   */
  async scrapeListings(searchParams: {
    rooms?: number[];
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    districts?: string[];
  }): Promise<KrishaListingItem[]> {
    const allListings: KrishaListingItem[] = [];
    const seenIds = new Set<string>();

    // Map district keys to Krisha path segments
    const districtPaths: (string | undefined)[] = [];
    if (searchParams.districts?.length) {
      for (const d of searchParams.districts) {
        const mapped = DISTRICT_MAP[d];
        if (mapped) {
          districtPaths.push(mapped);
        }
      }
    }
    // If no districts specified, search without district filter
    if (districtPaths.length === 0) {
      districtPaths.push(undefined);
    }

    // Distribute pages across districts
    const pagesPerDistrict = Math.max(1, Math.ceil(MAX_PAGES / districtPaths.length));

    for (const districtPath of districtPaths) {
      const baseParams = {
        rooms: searchParams.rooms,
        priceMin: searchParams.priceMin,
        priceMax: searchParams.priceMax,
        areaMin: searchParams.areaMin,
        areaMax: searchParams.areaMax,
        district: districtPath,
      };

      this.logger.log(`Scraping district: ${districtPath || "all"}`);

      for (let page = 1; page <= pagesPerDistrict; page++) {
        const url = this.buildSearchUrl({ ...baseParams, page });
        this.logger.log(`Scraping page ${page}: ${url}`);

        try {
          const $ = await this.fetchPage(url);
          const pageListings = this.parseListPage($);

          if (pageListings.length === 0) {
            this.logger.log(`No listings on page ${page}, stopping for this district`);
            break;
          }

          // Deduplicate across districts
          for (const listing of pageListings) {
            if (!seenIds.has(listing.krishaId)) {
              seenIds.add(listing.krishaId);
              allListings.push(listing);
            }
          }

          this.logger.log(`Found ${pageListings.length} listings on page ${page} (total: ${allListings.length})`);

          // Check if there's a next page
          const paginationLast = $(".paginator__btn--last").text();
          const totalPages = parseInt(paginationLast) || 1;
          if (page >= totalPages) break;
        } catch (err) {
          this.logger.error(`Failed to scrape page ${page}: ${err}`);
          break;
        }
      }
    }

    return allListings;
  }

  private parseListPage($: cheerio.CheerioAPI): KrishaListingItem[] {
    const listings: KrishaListingItem[] = [];

    $(".a-card").each((_i, el) => {
      const $el = $(el);

      // Get the link
      const link = $el.find("a.a-card__title").attr("href") || "";
      const krishaId = link.match(/show\/(\d+)/)?.[1] || "";
      if (!krishaId) return;

      const title = $el.find("a.a-card__title").text().trim();

      // Price: "35 000 000 ₸" -> 35000000
      const priceText = $el.find(".a-card__price").text().replace(/[^\d]/g, "");
      const price = parseInt(priceText) || 0;

      // Parse rooms and area from title
      const roomsMatch = title.match(/(\d+)-комн/);
      const rooms = roomsMatch ? parseInt(roomsMatch[1]) : 0;

      const areaMatch = title.match(/(\d+(?:\.\d+)?)\s*м/);
      const areaTotal = areaMatch ? parseFloat(areaMatch[1]) : 0;

      // Subtitle contains district/address info
      const district = $el.find(".a-card__subtitle").text().trim();

      // Thumbnail photo
      const photoThumb =
        $el.find(".a-card__image img").attr("src") ||
        $el.find(".a-card__image img").attr("data-src") ||
        "";

      listings.push({
        krishaId,
        krishaUrl: `https://krisha.kz${link}`,
        title,
        price,
        rooms,
        areaTotal,
        district,
        photoThumb,
      });
    });

    return listings;
  }

  /**
   * Scrape full detail for a single listing
   */
  async scrapeDetail(listing: KrishaListingItem): Promise<KrishaPropertyDetail> {
    const $ = await this.fetchPage(listing.krishaUrl);

    // Extract parameters from the detail page
    const params: Record<string, string> = {};

    // Method 1: offer__info-item format
    $(".offer__info-item").each((_i, el) => {
      const key = $(el).find(".offer__info-title").text().trim();
      const value = $(el).find(".offer__advert-short-info").text().trim();
      if (key && value) params[key] = value;
    });

    // Method 2: dl/dt/dd parameter list
    $(".offer__parameters dt, dl.offer__parameters dt").each((_i, el) => {
      const key = $(el).text().trim().replace(":", "");
      const value = $(el).next("dd").text().trim();
      if (key && value) params[key] = value;
    });

    // Method 3: a-params (alternative layout)
    $("dl.a-params dt").each((_i, el) => {
      const key = $(el).text().trim().replace(":", "");
      const value = $(el).next("dd").text().trim();
      if (key && value) params[key] = value;
    });

    // Title from detail page (fallback to listing title)
    const detailTitle = $("h1.offer__title").text().trim() ||
                        $("h1").first().text().trim() ||
                        listing.title;

    // Price from detail
    const priceText = $(".offer__price").text().replace(/[^\d]/g, "");
    const price = parseInt(priceText) || listing.price;

    // Floor
    const floorText = params["Этаж"] || params["этаж"] || "";
    const floorMatch = floorText.match(/(\d+)\s*из\s*(\d+)/);
    const floor = floorMatch ? parseInt(floorMatch[1]) : 0;
    const floorTotal = floorMatch ? parseInt(floorMatch[2]) : 0;

    // Areas
    const areaLivingMatch = (params["Жилая площадь"] || "").match(/(\d+(?:\.\d+)?)/);
    const areaKitchenMatch = (params["Площадь кухни"] || "").match(/(\d+(?:\.\d+)?)/);

    // Year built
    const yearText = params["Год постройки"] || params["Год сдачи"] || "";
    const yearMatch = yearText.match(/(\d{4})/);

    // Photos
    const photos: string[] = [];

    // From gallery images
    $(".gallery__small-item img, .offer__slider-item img, .gallery__main-item img").each((_i, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src && !photos.includes(src)) {
        photos.push(src.replace(/\/thumb\//, "/full/"));
      }
    });

    // From script data (JSON embedded photos)
    const scriptText = $("script").toArray().map((s) => $(s).html()).join("");
    const photoMatches = scriptText.match(/"src"\s*:\s*"(https:\/\/[^"]+\.jpe?g)"/g);
    if (photoMatches) {
      for (const match of photoMatches) {
        const url = match.replace(/"src"\s*:\s*"/, "").replace(/"$/, "");
        if (!photos.includes(url)) photos.push(url);
      }
    }

    // Add thumbnail if we got nothing
    if (photos.length === 0 && listing.photoThumb) {
      photos.push(listing.photoThumb);
    }

    // Complex name
    const complexName =
      params["Жилой комплекс"] ||
      $(".offer__advert-title--sub").text().trim() ||
      $("[data-name='complex']").text().trim() ||
      "";

    // Address
    const address =
      $(".offer__location").text().trim() ||
      params["Адрес"] ||
      listing.district;

    // Coordinates
    let lat: number | null = null;
    let lng: number | null = null;

    const mapEl = $("[data-lat]");
    if (mapEl.length) {
      lat = parseFloat(mapEl.attr("data-lat") || "");
      lng = parseFloat(mapEl.attr("data-lon") || mapEl.attr("data-lng") || "");
    }

    if (!lat) {
      const coordMatch = scriptText.match(/"lat"\s*:\s*([\d.]+).*?"lon"\s*:\s*([\d.]+)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
      }
    }

    // District from detail page
    const detailDistrict =
      $(".offer__location span").first().text().trim() ||
      listing.district;

    // Description
    const description =
      $(".offer__description .text").text().trim() ||
      $(".offer__description").text().trim() ||
      "";

    // Building type
    const buildingType = params["Тип строения"] || params["Тип дома"] || "";

    // Condition
    const condition = params["Состояние"] || "";

    // Seller info
    const sellerType = params["От кого"] || "";
    const phone = params["Телефон"] || "";

    return {
      krishaId: listing.krishaId,
      krishaUrl: listing.krishaUrl,
      title: detailTitle,
      price,
      rooms: listing.rooms,
      areaTotal: listing.areaTotal,
      areaLiving: areaLivingMatch ? parseFloat(areaLivingMatch[1]) : 0,
      areaKitchen: areaKitchenMatch ? parseFloat(areaKitchenMatch[1]) : 0,
      floor,
      floorTotal,
      buildingType,
      yearBuilt: yearMatch ? parseInt(yearMatch[1]) : null,
      condition,
      district: detailDistrict,
      address,
      complexName,
      lat,
      lng,
      phone,
      sellerType,
      photos,
      description,
    };
  }

  /**
   * Full parse pipeline: search → list → details
   * Returns fully parsed properties ready to save
   */
  async parseFromKrisha(
    interviewAnswers: Record<string, unknown>,
  ): Promise<KrishaPropertyDetail[]> {
    const searchParams = this.interviewToSearchParams(interviewAnswers);
    this.logger.log(`Search params: ${JSON.stringify(searchParams)}`);

    // Step 1: Get listings from search pages
    const listings = await this.scrapeListings(searchParams);
    this.logger.log(`Total listings found: ${listings.length}`);

    if (listings.length === 0) {
      this.logger.warn("No listings found on Krisha.kz");
      return [];
    }

    // Step 2: Get details for each listing (limited)
    const toFetch = listings.slice(0, MAX_DETAILS);
    const properties: KrishaPropertyDetail[] = [];

    for (const listing of toFetch) {
      try {
        const detail = await this.scrapeDetail(listing);
        properties.push(detail);
        this.logger.log(`Parsed detail: ${detail.krishaId} - ${detail.title}`);
      } catch (err) {
        this.logger.error(`Failed to parse detail ${listing.krishaId}: ${err}`);
        // Still save basic info from listing
        properties.push({
          krishaId: listing.krishaId,
          krishaUrl: listing.krishaUrl,
          title: listing.title,
          price: listing.price,
          rooms: listing.rooms,
          areaTotal: listing.areaTotal,
          areaLiving: 0,
          areaKitchen: 0,
          floor: 0,
          floorTotal: 0,
          buildingType: "",
          yearBuilt: null,
          condition: "",
          district: listing.district,
          address: listing.district,
          complexName: "",
          lat: null,
          lng: null,
          phone: "",
          sellerType: "",
          photos: listing.photoThumb ? [listing.photoThumb] : [],
          description: "",
        });
      }
    }

    return properties;
  }
}
