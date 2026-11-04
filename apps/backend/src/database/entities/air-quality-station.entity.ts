import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

/** Name and position of every station in `air_quality_daily`; the newest
 *  report wins, so a unit that moved is drawn where it is now. */
@Entity("air_quality_stations")
export class AirQualityStationEntity {
  @PrimaryColumn({ name: "station_id", type: "varchar", length: 64 })
  stationId: string;

  @Column()
  name: string;

  @Column({ type: "double precision" })
  lat: number;

  @Column({ type: "double precision" })
  lng: number;

  @Column({ type: "varchar", nullable: true })
  origin: string | null;

  @Column({ type: "varchar", nullable: true })
  district: string | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
