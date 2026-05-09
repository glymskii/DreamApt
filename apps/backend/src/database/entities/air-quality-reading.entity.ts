import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from "typeorm";

/**
 * One PM2.5 measurement from one AirKaz/air.org.kz station at one moment.
 * Append-only — the cron poller writes a new row every cycle, never updates
 * the previous one. This gives us a time-series we can later aggregate
 * (hourly/daily/weekday averages) for the dynamic heatmap.
 *
 * Composite index on (recorded_at, station_id) is the dominant query
 * pattern: "what did each station report in the last N hours" for the
 * time-slider, "average over last week" for the weekly heatmap.
 */
@Entity("air_quality_readings")
@Index("idx_aqr_time", ["recordedAt"])
@Index("idx_aqr_station_time", ["stationId", "recordedAt"])
export class AirQualityReadingEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** AirKaz/air.org.kz station id — string because some sources prefix it. */
  @Column({ name: "station_id" })
  stationId: string;

  @Column()
  name: string;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  lat: number;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  lng: number;

  /** PM2.5 reading in µg/m³. Nullable: stations sometimes report nothing. */
  @Column({ type: "decimal", precision: 6, scale: 2, nullable: true })
  pm25: number | null;

  @Column({ nullable: true })
  origin: string;

  @Column({ nullable: true })
  district: string;

  /**
   * The "as-of" timestamp from the upstream source. Used for time-series
   * windowing — we should NOT use createdAt for that, since multiple poll
   * cycles can land in the same minute.
   */
  @Column({ name: "recorded_at", type: "timestamp" })
  recordedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
