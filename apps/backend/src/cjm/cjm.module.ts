import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CJMService } from "./cjm.service";
import { NearbyPlacesService } from "./nearby-places.service";
import { CJMScenarioEntity } from "../database/entities/cjm-scenario.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { AIModule } from "../ai/ai.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CJMScenarioEntity, PropertyEntity, SearchProjectEntity]),
    AIModule,
  ],
  providers: [CJMService, NearbyPlacesService],
  exports: [CJMService],
})
export class CJMModule {}
