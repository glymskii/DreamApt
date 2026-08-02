import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  Header,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AirKazService } from "./airkaz.service";
import { AirQualityAggregateService } from "./air-quality-aggregate.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";

@Controller()
export class AirQualityController {
  constructor(
    private airKaz: AirKazService,
    private aggregates: AirQualityAggregateService,
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
  ) {}

  /** All Almaty PM 2.5 stations with live readings. PUBLIC.
   *  `source`/`stale` tell the client whether this is live data or a
   *  replayed archive snapshot (upstream outage). */
  @Get("air-quality/stations")
  async getStations() {
    const { stations, source, stale, asOf } = await this.airKaz.getStationsDetailed();
    return {
      source,
      stale,
      asOf,
      stations: stations
        .filter((s) => s.pm25 !== null)
        .map((s) => {
          const cls = this.airKaz.classifyPm25(s.pm25!);
          return {
            id: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            pm25: s.pm25,
            origin: s.origin,
            district: s.district,
            level: cls.level,
            levelLabel: cls.label,
            color: cls.color,
            updatedAt: s.date,
          };
        }),
    };
  }

  /**
   * How much PM2.5 history we hold. PUBLIC — plain counts over public
   * environmental data, and it drives the "hourly/weekday averages"
   * feature's availability check on the client.
   */
  @Get("air-quality/coverage")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300")
  async getCoverage() {
    return this.aggregates.getCoverage();
  }

  /**
   * Historical averages around a point, bucketed by hour-of-day and
   * weekday. PUBLIC.
   *   /air-quality/aggregate?lat=43.23&lng=76.92&radiusKm=3&days=90
   */
  @Get("air-quality/aggregate")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300")
  async getAggregate(
    @Query("lat") latRaw?: string,
    @Query("lng") lngRaw?: string,
    @Query("radiusKm") radiusRaw?: string,
    @Query("days") daysRaw?: string,
  ) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException("lat and lng are required numbers");
    }
    return this.aggregates.getForLocation(
      lat,
      lng,
      radiusRaw ? Number(radiusRaw) : 3,
      daysRaw ? Number(daysRaw) : 90,
    );
  }

  /** Same breakdown, addressed by complex id instead of raw coords. */
  @Get("complexes/:id/air-quality/history")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300")
  async getComplexAirHistory(
    @Param("id") id: string,
    @Query("radiusKm") radiusRaw?: string,
    @Query("days") daysRaw?: string,
  ) {
    const complex = await this.complexesRepo.findOne({ where: { id } });
    if (!complex) throw new NotFoundException("Complex not found");
    if (!complex.lat || !complex.lng) return { found: false };
    const result = await this.aggregates.getForLocation(
      Number(complex.lat),
      Number(complex.lng),
      radiusRaw ? Number(radiusRaw) : 3,
      daysRaw ? Number(daysRaw) : 90,
    );
    return { found: true, ...result };
  }

  /** Air quality for a specific complex (nearest active station). PUBLIC. */
  @Get("complexes/:id/air-quality")
  async getComplexAirQuality(@Param("id") id: string) {
    const complex = await this.complexesRepo.findOne({ where: { id } });
    if (!complex) throw new NotFoundException("Complex not found");
    if (!complex.lat || !complex.lng) {
      return { found: false };
    }
    const result = await this.airKaz.getNearestAirQuality(
      Number(complex.lat),
      Number(complex.lng),
    );
    if (!result) return { found: false };
    return { found: true, ...result };
  }
}
