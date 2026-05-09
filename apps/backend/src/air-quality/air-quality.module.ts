import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AirKazService } from "./airkaz.service";
import { AirQualityController } from "./air-quality.controller";
import { AirQualityRecorderService } from "./air-quality-recorder.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { AirQualityReadingEntity } from "../database/entities/air-quality-reading.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplexEntity, AirQualityReadingEntity]),
    AuthModule,
  ],
  controllers: [AirQualityController],
  providers: [AirKazService, AirQualityRecorderService],
  exports: [AirKazService],
})
export class AirQualityModule {}
