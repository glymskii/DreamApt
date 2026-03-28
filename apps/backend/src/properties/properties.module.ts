import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { TwoGisReviewsService } from "./twogis-reviews.service";
import { PropertyEntity } from "../database/entities/property.entity";
import { CJMScenarioEntity } from "../database/entities/cjm-scenario.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { AuthModule } from "../auth/auth.module";
import { CJMModule } from "../cjm/cjm.module";
import { ScoringModule } from "../scoring/scoring.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyEntity, CJMScenarioEntity, SearchProjectEntity]),
    AuthModule,
    CJMModule,
    ScoringModule,
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService, TwoGisReviewsService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
