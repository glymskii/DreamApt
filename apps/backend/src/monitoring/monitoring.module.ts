import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RequestStatEntity } from "../database/entities/request-stat.entity";
import { RequestStatService } from "./request-stat.service";
import { RequestStatInterceptor } from "./request-stat.interceptor";
import { MonitoringController } from "./monitoring.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([RequestStatEntity]),
    AuthModule, // AdminGuard depends on JwtAuthGuard which lives in AuthModule
  ],
  controllers: [MonitoringController],
  providers: [
    RequestStatService,
    // Registered as APP_INTERCEPTOR so it wraps every HTTP handler in
    // the app without each controller having to opt in. The interceptor
    // skips the stats endpoints themselves to avoid feedback loops.
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestStatInterceptor,
    },
  ],
  exports: [RequestStatService],
})
export class MonitoringModule {}
