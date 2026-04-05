import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { PropertiesModule } from "./properties/properties.module";
import { WishlistModule } from "./wishlist/wishlist.module";
import { SearchModule } from "./search/search.module";
import { AIModule } from "./ai/ai.module";
import { CommuteModule } from "./commute/commute.module";
import { ScoringModule } from "./scoring/scoring.module";
import { CJMModule } from "./cjm/cjm.module";
import { ComplexModule } from "./complex/complex.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ProjectsModule,
    PropertiesModule,
    WishlistModule,
    SearchModule,
    AIModule,
    CommuteModule,
    ScoringModule,
    CJMModule,
    ComplexModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
