import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Header,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { MapOverlaysService, OverlayConfigDTO } from "./map-overlays.service";

/**
 * Public endpoint — anyone can read overlay configs. Admin PUT path is
 * AdminGuard-gated.
 *
 * Cache-Control: short (10s) so the admin's calibration drag-and-save
 * propagates to other browsers near-instantly. The map-data endpoint
 * already embeds the configs in its 60s payload; this endpoint is the
 * direct path for the admin page itself.
 */
@Controller()
export class MapOverlaysController {
  constructor(private readonly overlays: MapOverlaysService) {}

  @Get("map-overlays")
  @Header("Cache-Control", "public, max-age=0, s-maxage=10")
  async list(): Promise<OverlayConfigDTO[]> {
    return this.overlays.list();
  }

  @Get("map-overlays/:key")
  @Header("Cache-Control", "public, max-age=0, s-maxage=10")
  async getOne(@Param("key") key: string): Promise<OverlayConfigDTO> {
    const cfg = await this.overlays.get(key);
    if (!cfg) throw new NotFoundException("Overlay not found");
    return cfg;
  }

  @Put("admin/map-overlays/:key")
  @UseGuards(AdminGuard)
  async update(
    @Param("key") key: string,
    @Body() patch: Partial<OverlayConfigDTO>,
  ): Promise<OverlayConfigDTO> {
    try {
      const updated = await this.overlays.update(key, patch);
      if (!updated) throw new NotFoundException("Overlay not found");
      return updated;
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err?.message || "Invalid overlay patch");
    }
  }
}
