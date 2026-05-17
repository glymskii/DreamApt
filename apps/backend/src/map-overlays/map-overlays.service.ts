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
   * Ensure the "genplan-2040" row exists. Uses our last-tried bbox as
   * the seed value; admin will fine-tune from there. Doesn't overwrite
   * existing rows — operator edits survive restarts.
   */
  async onModuleInit() {
    const existing = await this.repo.findOne({ where: { key: "genplan-2040" } });
    if (existing) return;
    await this.repo.save({
      key: "genplan-2040",
      imageUrl: "/genplan-2040.jpg",
      // Last math-derived bbox from PIL boundary detection — still not
      // pixel-perfect but a reasonable starting point.
      nwLon: 76.6836 as any, nwLat: 43.4157 as any,
      neLon: 77.1701 as any, neLat: 43.4157 as any,
      seLon: 77.1701 as any, seLat: 43.0325 as any,
      swLon: 76.6836 as any, swLat: 43.0325 as any,
      opacity: 0.65 as any,
    });
    this.logger.log('Seeded default config for overlay "genplan-2040"');
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
