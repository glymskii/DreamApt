import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

/** One imported file of the AAI dataset. `sha` is GitHub's blob hash: a
 *  file is re-imported only when the dataset republishes it (the current
 *  month grows until it's complete). */
@Entity("air_quality_imports")
export class AirQualityImportEntity {
  /** Path in the dataset repo, e.g. open_sensors/2026_data/AAI_2026_09.csv */
  @PrimaryColumn({ type: "varchar", length: 200 })
  path: string;

  @Column({ type: "varchar", length: 64 })
  sha: string;

  /** Station-days written. */
  @Column({ type: "int" })
  rows: number;

  @Column({ type: "int" })
  stations: number;

  @Column({ name: "first_day", type: "date", nullable: true })
  firstDay: string | null;

  @Column({ name: "last_day", type: "date", nullable: true })
  lastDay: string | null;

  /** CleaningStats: how many rows each rule dropped. */
  @Column({ type: "jsonb", nullable: true })
  stats: Record<string, number> | null;

  @UpdateDateColumn({ name: "imported_at" })
  importedAt: Date;
}
