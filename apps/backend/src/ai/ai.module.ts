import { Module } from "@nestjs/common";
import { AIService } from "./ai.service";
import { SearchStatsModule } from "../search-stats/search-stats.module";

@Module({
  imports: [SearchStatsModule], // token usage of every OpenAI call
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
