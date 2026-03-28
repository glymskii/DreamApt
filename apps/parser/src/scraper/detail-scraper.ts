import { KrishaClient } from "./krisha-client";

export interface PropertyDetail {
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
  rawData: Record<string, string>;
}

export class DetailScraper {
  constructor(private client: KrishaClient) {}

  async scrapeDetail(url: string, krishaId: string): Promise<PropertyDetail> {
    const $ = await this.client.fetchPage(url);

    // Extract parameters
    const params: Record<string, string> = {};
    $(".offer__info-item").each((_i, el) => {
      const key = $(el).find(".offer__info-title").text().trim();
      const value = $(el).find(".offer__advert-short-info").text().trim();
      if (key && value) params[key] = value;
    });

    // Also try data attributes
    $("dl.a-params dt").each((_i, el) => {
      const key = $(el).text().trim().replace(":", "");
      const value = $(el).next("dd").text().trim();
      if (key && value) params[key] = value;
    });

    const title = $("h1.offer__title").text().trim() || $("title").text().trim();
    const priceText = $(".offer__price").text().replace(/\s/g, "");
    const price = parseInt(priceText) || 0;

    // Parse rooms and area from title
    const titleMatch = title.match(/(\d+)-комн/);
    const rooms = titleMatch ? parseInt(titleMatch[1]) : 0;

    const areaMatch = title.match(/(\d+(?:\.\d+)?)\s*м/);
    const areaTotal = areaMatch ? parseFloat(areaMatch[1]) : 0;

    const floorMatch = (params["Этаж"] || "").match(/(\d+)\s*из\s*(\d+)/);
    const floor = floorMatch ? parseInt(floorMatch[1]) : 0;
    const floorTotal = floorMatch ? parseInt(floorMatch[2]) : 0;

    const areaLivingMatch = (params["Жилая площадь"] || "").match(/(\d+(?:\.\d+)?)/);
    const areaKitchenMatch = (params["Площадь кухни"] || "").match(/(\d+(?:\.\d+)?)/);

    const yearMatch = (params["Год постройки"] || params["Год сдачи"] || "").match(/(\d{4})/);

    // Photos
    const photos: string[] = [];
    $(".gallery__small-item img, .offer__slider-item img").each((_i, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src && !photos.includes(src)) {
        photos.push(src.replace(/\/thumb\//, "/full/"));
      }
    });

    // Try to get photos from script data
    const scriptText = $("script")
      .toArray()
      .map((s) => $(s).html())
      .join("");
    const photoMatches = scriptText.match(/"src":"(https:\/\/[^"]+\.jpg)"/g);
    if (photoMatches) {
      for (const match of photoMatches) {
        const url = match.replace(/"src":"/, "").replace(/"$/, "");
        if (!photos.includes(url)) photos.push(url);
      }
    }

    // Complex name
    const complexName =
      params["Жилой комплекс"] ||
      $(".offer__advert-title--sub").text().trim() ||
      "";

    // Address
    const address =
      $(".offer__location").text().trim() ||
      params["Адрес"] ||
      "";

    // Coordinates from map
    let lat: number | null = null;
    let lng: number | null = null;
    const mapEl = $("[data-lat]");
    if (mapEl.length) {
      lat = parseFloat(mapEl.attr("data-lat") || "");
      lng = parseFloat(mapEl.attr("data-lon") || mapEl.attr("data-lng") || "");
    }
    // Try from script
    const coordMatch = scriptText.match(/"lat":\s*([\d.]+).*?"lon":\s*([\d.]+)/);
    if (!lat && coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }

    const district = $(".offer__location span").first().text().trim() || "";
    const description = $(".offer__description .text").text().trim() || "";

    return {
      krishaId,
      krishaUrl: url,
      title,
      price,
      rooms,
      areaTotal,
      areaLiving: areaLivingMatch ? parseFloat(areaLivingMatch[1]) : 0,
      areaKitchen: areaKitchenMatch ? parseFloat(areaKitchenMatch[1]) : 0,
      floor,
      floorTotal,
      buildingType: params["Тип строения"] || params["Тип дома"] || "",
      yearBuilt: yearMatch ? parseInt(yearMatch[1]) : null,
      condition: params["Состояние"] || "",
      district,
      address,
      complexName,
      lat,
      lng,
      phone: params["Телефон"] || "",
      sellerType: params["От кого"] || "",
      photos,
      description,
      rawData: params,
    };
  }
}
