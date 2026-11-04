import { Entity, PrimaryColumn, Column, Index, UpdateDateColumn } from "typeorm";

/**
 * Long-term PM2.5 archive: one row per station per Almaty local day, the
 * 24 hourly means packed into an array. A year of ~250 sensors is ~90k
 * rows (~20 MB) — the raw `air_quality_readings` table would need ~2M
 * rows and half a gigabyte for the same history.
 *
 * Two writers, never mixed within a day:
 *  - `aai`  — Almaty Air Initiative's published monthly dataset (complete,
 *             already validated upstream, cleaned again on import);
 *  - `live` — our own snapshots rolled up from `air_quality_readings`, for
 *             the days the dataset hasn't published yet.
 * Importing a month deletes the `live` rows of the days it covers, and the
 * rollup never touches days at or before the newest `aai` day.
 *
 * Every history query (ЖК card, map's typical day, coverage) reads here.
 */
@Entity("air_quality_daily")
@Index("idx_aqd_day", ["day"])
export class AirQualityDailyEntity {
  @PrimaryColumn({ name: "station_id", type: "varchar", length: 64 })
  stationId: string;

  /** Almaty local day. */
  @PrimaryColumn({ type: "date" })
  day: string;

  /** 24 values, index = local hour; NULL where the hour has no reading. */
  @Column({ type: "real", array: true })
  pm25: (number | null)[];

  /** Non-null hours in `pm25`, so coverage needs no unnest. */
  @Column({ type: "smallint" })
  hours: number;

  @Column({ type: "varchar", length: 8 })
  source: "aai" | "live";

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
