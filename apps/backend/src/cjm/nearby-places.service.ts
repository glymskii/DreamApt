import { Injectable, Logger } from "@nestjs/common";

const TWOGIS_KEY = "rubnkm7490";

export interface NearbyPlace {
  name: string;
  category: string; // park, gym, cafe, mall, school, hospital
  address: string;
  distanceMeters: number;
}

export interface NearbyPlaces {
  parks: NearbyPlace[];
  gyms: NearbyPlace[];
  cafes: NearbyPlace[];
  malls: NearbyPlace[];
  schools: NearbyPlace[];
  hospitals: NearbyPlace[];
}

// 2GIS rubric IDs for different place categories
const RUBRICS: Record<string, { query: string; category: string }> = {
  parks: { query: "парк сквер", category: "park" },
  gyms: { query: "фитнес спортзал", category: "gym" },
  cafes: { query: "кафе ресторан", category: "cafe" },
  malls: { query: "торговый центр ТРЦ", category: "mall" },
  schools: { query: "школа гимназия", category: "school" },
  hospitals: { query: "больница поликлиника", category: "hospital" },
};

@Injectable()
export class NearbyPlacesService {
  private readonly logger = new Logger(NearbyPlacesService.name);

  /**
   * Find real nearby places around given coordinates using 2GIS API
   */
  async findNearby(lat: number, lng: number): Promise<NearbyPlaces> {
    const result: NearbyPlaces = {
      parks: [],
      gyms: [],
      cafes: [],
      malls: [],
      schools: [],
      hospitals: [],
    };

    // Fetch all categories in parallel
    const entries = Object.entries(RUBRICS);
    const promises = entries.map(async ([key, { query, category }]) => {
      try {
        const places = await this.searchNearby(lat, lng, query, category);
        (result as any)[key] = places;
      } catch (err) {
        this.logger.debug(`Failed to fetch ${key}: ${err}`);
      }
    });

    await Promise.all(promises);
    return result;
  }

  private async searchNearby(
    lat: number,
    lng: number,
    query: string,
    category: string,
  ): Promise<NearbyPlace[]> {
    const q = encodeURIComponent(query);
    // Search within 2km radius, sorted by distance
    const url = `https://catalog.api.2gis.com/3.0/items?q=${q}&point=${lng},${lat}&radius=2000&sort=distance&fields=items.point&page_size=5&key=${TWOGIS_KEY}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
    });

    if (!res.ok) return [];
    const data = await res.json();
    const items = data.result?.items;
    if (!items?.length) return [];

    return items.filter((item: any) => item.name && item.name.trim().length > 0).slice(0, 3).map((item: any) => {
      // Calculate approximate distance
      const itemLat = item.point?.lat || lat;
      const itemLng = item.point?.lon || item.point?.lng || lng;
      const dist = this.haversineDistance(lat, lng, itemLat, itemLng);

      return {
        name: item.name || "",
        category,
        address: item.address_name || "",
        distanceMeters: Math.round(dist),
      };
    });
  }

  /** Haversine distance in meters */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Format nearby places into a text description for AI prompt
   */
  formatForPrompt(places: NearbyPlaces): string {
    const lines: string[] = [];

    const formatCategory = (items: NearbyPlace[], label: string) => {
      if (items.length === 0) return;
      const list = items
        .map((p) => {
          const dist = p.distanceMeters < 1000
            ? `${p.distanceMeters} м`
            : `${(p.distanceMeters / 1000).toFixed(1)} км`;
          return `${p.name} (${dist}${p.address ? ", " + p.address : ""})`;
        })
        .join("; ");
      lines.push(`${label}: ${list}`);
    };

    formatCategory(places.parks, "Парки и скверы рядом");
    formatCategory(places.gyms, "Фитнес/спортзалы рядом");
    formatCategory(places.cafes, "Кафе/рестораны рядом");
    formatCategory(places.malls, "ТРЦ/магазины рядом");
    formatCategory(places.schools, "Школы рядом");
    formatCategory(places.hospitals, "Больницы/поликлиники рядом");

    return lines.join("\n");
  }
}
