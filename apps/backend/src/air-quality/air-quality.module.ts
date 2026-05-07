import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AirKazService } from "./airkaz.service";
import { AirQualityController } from "./air-quality.controller";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplexEntity]),
    AuthModule,
  ],
  controllers: [AirQualityController],
  providers: [AirKazService],
  exports: [AirKazService],
})
export class AirQualityModule {}
