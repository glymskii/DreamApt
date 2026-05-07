import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AirKazService } from "./airkaz.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";

@Controller()
export class AirQualityController {
  constructor(
    private airKaz: AirKazService,
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
  ) {}

  /** All Almaty PM 2.5 stations with live readings. PUBLIC. */
  @Get("air-quality/stations")
  async getStations() {
    const stations = await this.airKaz.getStations();
    return {
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
