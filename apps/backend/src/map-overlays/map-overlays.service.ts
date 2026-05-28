import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MapOverlayConfigEntity } from "../database/entities/map-overlay-config.entity";

/**
 * Public DTO for an overlay config — used both for the admin GET and the
 * public /map-data response. Strings-as-numbers from Postgres (decimal
 * columns return as strings) get coerced here so the frontend gets pure
 * numbers.
 */
export interface OverlayConfigDTO {
  key: string;
  imageUrl: string;
  nwLon: number;
  nwLat: number;
  neLon: number;
  neLat: number;
  seLon: number;
  seLat: number;
  swLon: number;
  swLat: number;
  opacity: number;
}

/**
 * Service for map overlay calibration data. Seeds the "genplan-2040"
 * row on module init with the current best-guess corner values, then
 * lets admin overwrite via PUT. The dashboard map reads these every
 * time /map-data is fetched.
 */
@Injectable()
export class MapOverlaysService implements OnModuleInit {
  private readonly logger = new Logger(MapOverlaysService.name);

  constructor(
    @InjectRepository(MapOverlayConfigEntity)
    private repo: Repository<MapOverlayConfigEntity>,
  ) {}

  /**
   * Ensure default overlay rows exist. Each is seeded only if absent, so
   * operator calibration edits survive restarts. bbox values are rough
   * starting points — admin drags the 4 corners to align each raster via
   * /admin/genplan-align?key=<key>.
   *
   * Overlays:
   *  - genplan-2040: citywide 2040 master plan (НИИ Алматыгенплан)
   *  - pdp-*: per-zone Проекты детальной планировки — official scans from
   *    almatygenplan.kz cropped to the map area. Each covers only its
   *    planning zone, not the whole city.
   */
  async onModuleInit() {
    const seeds: OverlayConfigDTO[] = [
      {
        key: "genplan-2040", imageUrl: "/genplan-2040.jpg",
        nwLon: 76.6836, nwLat: 43.4157, neLon: 77.1701, neLat: 43.4157,
        seLon: 77.1701, seLat: 43.0325, swLon: 76.6836, swLat: 43.0325,
        opacity: 0.65,
      },
      {
        key: "pdp-aksay-zhetysu", imageUrl: "/pdp-aksay-zhetysu.jpg",
        nwLon: 76.82, nwLat: 43.24, neLon: 76.90, neLat: 43.24,
        seLon: 76.90, seLat: 43.16, swLon: 76.82, swLat: 43.16,
        opacity: 0.7,
      },
      {
        key: "pdp-ryskulbekov-navoi", imageUrl: "/pdp-ryskulbekov-navoi.jpg",
        nwLon: 76.85, nwLat: 43.25, neLon: 76.93, neLat: 43.25,
        seLon: 76.93, seLat: 43.17, swLon: 76.85, swLat: 43.17,
        opacity: 0.7,
      },
      {
        key: "pdp-sairan", imageUrl: "/pdp-sairan.jpg",
        nwLon: 76.84, nwLat: 43.27, neLon: 76.92, neLat: 43.27,
        seLon: 76.92, seLat: 43.19, swLon: 76.84, swLat: 43.19,
        opacity: 0.7,
      },
    ];
    for (const s of seeds) {
      const existing = await this.repo.findOne({ where: { key: s.key } });
      if (existing) continue;
      await this.repo.save({
        key: s.key, imageUrl: s.imageUrl,
        nwLon: s.nwLon as any, nwLat: s.nwLat as any,
        neLon: s.neLon as any, neLat: s.neLat as any,
        seLon: s.seLon as any, seLat: s.seLat as any,
        swLon: s.swLon as any, swLat: s.swLat as any,
        opacity: s.opacity as any,
      });
      this.logger.log(`Seeded default config for overlay "${s.key}"`);
    }
  }

  async get(key: string): Promise<OverlayConfigDTO | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? toDTO(row) : null;
  }

  async list(): Promise<OverlayConfigDTO[]> {
    const rows = await this.repo.find();
    return rows.map(toDTO);
  }

  /**
   * Patch a single overlay's calibration. Validates that opacity stays
   * in [0,1] and lat/lng numerics are finite — the admin client should
   * already enforce this but defence-in-depth is cheap.
   */
  async update(
    key: string,
    patch: Partial<OverlayConfigDTO>,
  ): Promise<OverlayConfigDTO | null> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) return null;

    const numFields: (keyof OverlayConfigDTO)[] = [
      "nwLon", "nwLat", "neLon", "neLat",
      "seLon", "seLat", "swLon", "swLat",
      "opacity",
    ];
    for (const f of numFields) {
      const v = patch[f as keyof OverlayConfigDTO];
      if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) {
        throw new Error(`Invalid value for ${f}: must be a finite number`);
      }
    }
    if (patch.opacity !== undefined && (patch.opacity! < 0 || patch.opacity! > 1)) {
      throw new Error("opacity must be in [0, 1]");
    }
    if (patch.imageUrl && typeof patch.imageUrl === "string") {
      row.imageUrl = patch.imageUrl;
    }

    for (const f of numFields) {
      if (patch[f as keyof OverlayConfigDTO] !== undefined) {
        (row as any)[f] = patch[f as keyof OverlayConfigDTO];
      }
    }

    const saved = await this.repo.save(row);
    return toDTO(saved);
  }
}

/** Coerce decimal columns from string back to number for the wire. */
function toDTO(r: MapOverlayConfigEntity): OverlayConfigDTO {
  return {
    key: r.key,
    imageUrl: r.imageUrl,
    nwLon: Number(r.nwLon),
    nwLat: Number(r.nwLat),
    neLon: Number(r.neLon),
    neLat: Number(r.neLat),
    seLon: Number(r.seLon),
    seLat: Number(r.seLat),
    swLon: Number(r.swLon),
    swLat: Number(r.swLat),
    opacity: Number(r.opacity),
  };
}
