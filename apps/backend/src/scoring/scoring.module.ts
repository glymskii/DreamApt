import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScoringService } from "./scoring.service";
import { PropertyEntity } from "../database/entities/property.entity";
import { CommuteModule } from "../commute/commute.module";
import { AIModule } from "../ai/ai.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyEntity]),
    CommuteModule,
    AIModule,
  ],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
