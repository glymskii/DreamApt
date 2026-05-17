import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
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
import { AirQualityModule } from "./air-quality/air-quality.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { MapOverlaysModule } from "./map-overlays/map-overlays.module";
import { TelegramModule } from "./telegram/telegram.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    // Global rate limiting — the multi-tier config protects different
    // surfaces with different aggressiveness:
    //   - "short": absorbs single-user click spam (10/sec)
    //   - "medium": stops scrapers iterating /complexes/all (100/min)
    //   - "long":   smoothes longer-form abuse like brute-force from
    //              a residential IP (1000/15min)
    // Per-route stricter overrides live next to the controller (see
    // AuthController @Throttle on login + register-request).
    ThrottlerModule.forRoot([
      { name: "short", ttl: 1_000, limit: 10 },
      { name: "medium", ttl: 60_000, limit: 100 },
      { name: "long", ttl: 15 * 60_000, limit: 1000 },
    ]),
    // Enables @Cron decorators on injected services (AirQualityRecorder).
    ScheduleModule.forRoot(),
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
    AirQualityModule,
    MonitoringModule,
    MapOverlaysModule,
    TelegramModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
