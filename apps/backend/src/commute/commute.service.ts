import { Injectable } from "@nestjs/common";

interface CommuteResult {
  minutes: number;
  trafficDirection: "with_traffic" | "against_traffic" | "neutral";
}

@Injectable()
export class CommuteService {
  private apiKey = process.env.TWOGIS_API_KEY || "";

  // Almaty morning rush flows approximately NNW (340°) toward the city center
  private readonly RUSH_BEARING = 340;

  async getCommute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: string = "car",
  ): Promise<CommuteResult> {
    const bearing = this.computeBearing(fromLat, fromLng, toLat, toLng);
    const angleDiff = Math.abs(
      ((bearing - this.RUSH_BEARING + 540) % 360) - 180,
    );

    let trafficDirection: CommuteResult["trafficDirection"];
    if (angleDiff < 45) {
      trafficDirection = "with_traffic";
    } else if (angleDiff > 135) {
      trafficDirection = "against_traffic";
    } else {
      trafficDirection = "neutral";
    }

    let minutes: number;

    if (this.apiKey) {
      try {
        minutes = await this.fetch2GISRoute(fromLat, fromLng, toLat, toLng);
      } catch (err) {
        console.error("2GIS routing failed, using estimation:", err);
        minutes = this.estimateMinutes(fromLat, fromLng, toLat, toLng, mode);
      }
    } else {
      minutes = this.estimateMinutes(fromLat, fromLng, toLat, toLng, mode);
    }

    return { minutes, trafficDirection };
  }

  private async fetch2GISRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<number> {
    const url = `https://routing.api.2gis.com/routing/7.0.0/global?key=${this.apiKey}`;
    const body = {
      points: [
        { type: "stop", lat: fromLat, lon: fromLng },
        { type: "stop", lat: toLat, lon: toLng },
      ],
      locale: "ru",
      type: "jam",
      route_mode: "fastest",
      traffic_mode: "statistics",
      output: "summary",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`2GIS API returned ${res.status}`);
    }

    const data = await res.json();
    const duration = data?.result?.[0]?.duration;
    return duration ? Math.round(duration / 60) : this.estimateMinutes(fromLat, fromLng, toLat, toLng, "car");
  }

  private estimateMinutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: string,
  ): number {
    const distKm = this.haversineDistance(fromLat, fromLng, toLat, toLng);

    switch (mode) {
      case "walking":
        return Math.round(distKm / 5 * 60); // 5 km/h
      case "public_transport":
        return Math.round(distKm / 15 * 60) + 10; // 15 km/h + wait
      case "car":
      default:
        // Almaty average speed ~25 km/h during rush
        return Math.round(distKm / 25 * 60);
    }
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private computeBearing(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const dLng = this.toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(this.toRad(lat2));
    const x =
      Math.cos(this.toRad(lat1)) * Math.sin(this.toRad(lat2)) -
      Math.sin(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
