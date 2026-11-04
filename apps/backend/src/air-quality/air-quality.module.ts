import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AirKazService } from "./airkaz.service";
import { AirQualityController } from "./air-quality.controller";
import { AirQualityRecorderService } from "./air-quality-recorder.service";
import { AirQualityAggregateService } from "./air-quality-aggregate.service";
import { AirQualityArchiveService } from "./air-quality-archive.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { AirQualityReadingEntity } from "../database/entities/air-quality-reading.entity";
import { AirQualityDailyEntity } from "../database/entities/air-quality-daily.entity";
import { AirQualityImportEntity } from "../database/entities/air-quality-import.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResidentialComplexEntity,
      AirQualityReadingEntity,
      AirQualityDailyEntity,
      AirQualityImportEntity,
    ]),
    AuthModule,
  ],
  controllers: [AirQualityController],
  providers: [
    AirKazService,
    AirQualityRecorderService,
    AirQualityAggregateService,
    AirQualityArchiveService,
  ],
  exports: [AirKazService, AirQualityAggregateService],
})
export class AirQualityModule {}
