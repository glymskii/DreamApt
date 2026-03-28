import Bottleneck from "bottleneck";
import * as cheerio from "cheerio";

const RATE_LIMIT_MS = parseInt(process.env.KRISHA_RATE_LIMIT_MS || "3000");

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
];

export class KrishaClient {
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

  async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    return this.limiter.schedule(async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.getRandomUA(),
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
      });

      if (!res.ok) {
        throw new Error(`Krisha returned ${res.status} for ${url}`);
      }

      const html = await res.text();
      return cheerio.load(html);
    });
  }

  buildSearchUrl(params: {
    rooms?: number[];
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    districts?: string[];
    page?: number;
  }): string {
    const base = "https://krisha.kz/prodazha/kvartiry/almaty/";
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

    // Only search in residential complexes
    queryParts.push("das[who]=1"); // owner/agent filter
    queryParts.push("das[_sys.hasphoto]=1"); // with photos

    return `${base}?${queryParts.join("&")}`;
  }
}
