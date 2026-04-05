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

  @Column({ name: "project_id" })
  projectId: string;

  @Column()
  name: string;

  @Column({ name: "display_name", nullable: true })
  displayName: string;

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

  @Column({ name: "shutov_category", nullable: true })
  shutovCategory: number;

  // Seismic
  @Column({ name: "seismic_risk_level", nullable: true })
  seismicRiskLevel: string;

  @Column({ name: "seismic_distance_meters", nullable: true })
  seismicDistanceMeters: number;

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
