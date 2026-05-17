import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MapOverlayConfigEntity } from "../database/entities/map-overlay-config.entity";
import { MapOverlaysService } from "./map-overlays.service";
import { MapOverlaysController } from "./map-overlays.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([MapOverlayConfigEntity]),
    AuthModule, // AdminGuard depends on JwtAuthGuard from AuthModule
  ],
  providers: [MapOverlaysService],
  controllers: [MapOverlaysController],
  exports: [MapOverlaysService],
})
export class MapOverlaysModule {}
