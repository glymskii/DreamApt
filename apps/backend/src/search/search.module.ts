import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { KrishaParserService } from "./krisha-parser.service";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { PropertyGroupEntity } from "../database/entities/property-group.entity";
import { AIModule } from "../ai/ai.module";
import { ScoringModule } from "../scoring/scoring.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchProjectEntity, PropertyEntity, PropertyGroupEntity]),
    AIModule,
    ScoringModule,
    AuthModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, KrishaParserService],
  exports: [SearchService],
})
export class SearchModule {}
