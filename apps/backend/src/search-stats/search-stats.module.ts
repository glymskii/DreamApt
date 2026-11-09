import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SearchRunEntity } from "../database/entities/search-run.entity";
import { AiUsageStatEntity } from "../database/entities/ai-usage-stat.entity";
import { SearchStatsService } from "./search-stats.service";

@Module({
  imports: [TypeOrmModule.forFeature([SearchRunEntity, AiUsageStatEntity])],
  providers: [SearchStatsService],
  exports: [SearchStatsService],
})
export class SearchStatsModule {}
