import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  UpdateDateColumn,
  CreateDateColumn,
} from "typeorm";

/**
 * Per-overlay calibration for raster image layers we render on the map.
 *
 * Why a table and not a JSON file: admin adjusts the corner positions
 * interactively in /admin/genplan-align, and the saved values need to
 * survive backend redeploys + be picked up by the public /map-data
 * endpoint within seconds. Postgres row + cache invalidation is the
 * cheapest path; a JSON file in `public/` would require redeploys to
 * change, which defeats the whole "drag the corners" UX.
 *
 * Storage shape: one row per named overlay (`key`). Currently just
 * "genplan-2040", but the columns are generic enough that future
 * overlays (other genplan pages, transit plans, etc.) can reuse the
 * same table.
 */
@Entity("map_overlay_configs")
@Unique("uq_map_overlay_key", ["key"])
export class MapOverlayConfigEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Stable lookup key, e.g. "genplan-2040". */
  @Column()
  key: string;

  /** Public URL of the image asset (served by Vercel from /public). */
  @Column({ name: "image_url" })
  imageUrl: string;

  // Four corner coordinates of the image overlay. MapLibre's image source
  // accepts any quadrilateral, so corners can be moved independently and
  // the image gets warped accordingly. Stored as decimals to preserve
  // sub-meter precision (~7 digits of decimal degrees ≈ 1cm).
  @Column({ name: "nw_lon", type: "decimal", precision: 10, scale: 7 })
  nwLon: number;
  @Column({ name: "nw_lat", type: "decimal", precision: 10, scale: 7 })
  nwLat: number;

  @Column({ name: "ne_lon", type: "decimal", precision: 10, scale: 7 })
  neLon: number;
  @Column({ name: "ne_lat", type: "decimal", precision: 10, scale: 7 })
  neLat: number;

  @Column({ name: "se_lon", type: "decimal", precision: 10, scale: 7 })
  seLon: number;
  @Column({ name: "se_lat", type: "decimal", precision: 10, scale: 7 })
  seLat: number;

  @Column({ name: "sw_lon", type: "decimal", precision: 10, scale: 7 })
  swLon: number;
  @Column({ name: "sw_lat", type: "decimal", precision: 10, scale: 7 })
  swLat: number;

  /** Raster layer opacity 0..1. Default 0.65 keeps base map readable. */
  @Column({ type: "decimal", precision: 3, scale: 2, default: 0.65 })
  opacity: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
