import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { SearchProjectEntity } from "./search-project.entity";
import { PropertyEntity } from "./property.entity";

@Entity("residential_complexes")
@Index("idx_rc_project", ["projectId"])
@Index("idx_rc_score", ["scoreTotal"])
export class ResidentialComplexEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "project_id", nullable: true })
  projectId: string;

  @Column()
  name: string;

  @Column({ name: "display_name", nullable: true })
  displayName: string;

  @Column({ name: "krisha_complex_id", nullable: true })
  krishaComplexId: string;

  @Column({ name: "krisha_url", nullable: true })
  krishaUrl: string;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lng: number;

  @Column({ nullable: true })
  district: string;

  @Column({ type: "text", nullable: true })
  address: string;

  // Aggregates
  @Column({ name: "price_min", type: "bigint", nullable: true })
  priceMin: number;

  @Column({ name: "price_max", type: "bigint", nullable: true })
  priceMax: number;

  @Column({ name: "price_avg", type: "bigint", nullable: true })
  priceAvg: number;

  @Column({ name: "listings_count", default: 0 })
  listingsCount: number;

  @Column({ name: "floors_max", nullable: true })
  floorsMax: number;

  @Column({ name: "floor_segment", nullable: true })
  floorSegment: string;

  // Scores
  @Column({ name: "score_total", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreTotal: number;

  @Column({ name: "score_infrastructure", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreInfrastructure: number;

  @Column({ name: "score_lifestyle", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreLifestyle: number;

  @Column({ name: "score_commute", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreCommute: number;

  @Column({ name: "score_seismic", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreSeismic: number;

  @Column({ name: "commute_minutes", nullable: true })
  commuteMinutes: number;

  @Column({ name: "commute_traffic_direction", nullable: true })
  commuteTrafficDirection: string;

  // Cached external data
  @Column({ name: "twogis_rating", type: "decimal", precision: 3, scale: 1, nullable: true })
  twogisRating: number;

  @Column({ name: "twogis_review_count", nullable: true })
  twogisReviewCount: number;

  // Full 2GIS reviews payload — persisted for 24h to avoid hammering the
  // public demo key (`rubnkm7490`). Without this, every guest click on a ЖК
  // fires up to 7 catalog+reviews calls — at viral traffic the key gets
  // banned in minutes and breaks 2GIS for everyone.
  @Column({ name: "twogis_reviews_json", type: "jsonb", nullable: true })
  twogisReviewsJson: any;

  @Column({ name: "twogis_fetched_at", type: "timestamp", nullable: true })
  twogisFetchedAt: Date;

  @Column({ name: "shutov_category", nullable: true })
  shutovCategory: number;

  // Seismic
  @Column({ name: "seismic_risk_level", nullable: true })
  seismicRiskLevel: string;

  @Column({ name: "seismic_distance_meters", nullable: true })
  seismicDistanceMeters: number;

  // Air quality (PM 2.5 from AirKaz.org)
  @Column({ name: "air_quality_pm25", type: "decimal", precision: 6, scale: 2, nullable: true })
  airQualityPm25: number;

  @Column({ name: "air_quality_level", nullable: true })
  airQualityLevel: string; // good | moderate | sensitive | unhealthy | very_unhealthy | hazardous

  @Column({ name: "air_quality_station", nullable: true })
  airQualityStation: string;

  @Column({ name: "air_quality_distance_meters", nullable: true })
  airQualityDistanceMeters: number;

  @Column({ name: "air_quality_updated_at", type: "timestamp", nullable: true })
  airQualityUpdatedAt: Date;

  // Meta
  @Column({ name: "grouping_method", nullable: true })
  groupingMethod: string;

  @Column({ name: "scoring_explanation", type: "text", nullable: true })
  scoringExplanation: string;

  // Photo (best photo from properties)
  @Column({ name: "photo_url", type: "text", nullable: true })
  photoUrl: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => SearchProjectEntity, (project) => project.complexes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project: SearchProjectEntity;

  @OneToMany(() => PropertyEntity, (property) => property.complex)
  properties: PropertyEntity[];
}
