import { KrishaClient } from "./krisha-client";

export interface ListingItem {
  krishaId: string;
  krishaUrl: string;
  title: string;
  price: number;
  rooms: number;
  areaTotal: number;
  district: string;
}

export class ListingScraper {
  constructor(private client: KrishaClient) {}

  async scrapeListPage(url: string): Promise<{
    listings: ListingItem[];
    hasNextPage: boolean;
    totalPages: number;
  }> {
    const $ = await this.client.fetchPage(url);
    const listings: ListingItem[] = [];

    $(".a-card").each((_i, el) => {
      const $el = $(el);
      const link = $el.find("a.a-card__title").attr("href") || "";
      const krishaId = link.match(/show\/(\d+)/)?.[1] || "";
      const title = $el.find("a.a-card__title").text().trim();
      const priceText = $el.find(".a-card__price").text().replace(/\s/g, "");
      const price = parseInt(priceText) || 0;

      const descParts = title.match(/(\d+)-комн.*?(\d+(?:\.\d+)?)\s*м/);
      const rooms = descParts ? parseInt(descParts[1]) : 0;
      const areaTotal = descParts ? parseFloat(descParts[2]) : 0;

      const district = $el.find(".a-card__subtitle").text().trim();

      if (krishaId) {
        listings.push({
          krishaId,
          krishaUrl: `https://krisha.kz${link}`,
          title,
          price,
          rooms,
          areaTotal,
          district,
        });
      }
    });

    // Check pagination
    const paginationText = $(".paginator__btn--last").text();
    const totalPages = parseInt(paginationText) || 1;
    const currentPage =
      parseInt($(".paginator__btn--active").text()) || 1;
    const hasNextPage = currentPage < totalPages;

    return { listings, hasNextPage, totalPages };
  }
}
