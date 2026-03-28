import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { SearchProjectEntity } from "./search-project.entity";
import { PropertyGroupEntity } from "./property-group.entity";
import { CJMScenarioEntity } from "./cjm-scenario.entity";
import { WishlistItemEntity } from "./wishlist-item.entity";

@Entity("properties")
@Index("idx_properties_project", ["projectId"])
@Index("idx_properties_score", ["scoreTotal"])
export class PropertyEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "project_id" })
  projectId: string;

  @Column({ name: "krisha_id" })
  krishaId: string;

  @Column({ name: "krisha_url" })
  krishaUrl: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: "bigint", nullable: true })
  price: number;

  @Column({ nullable: true })
  rooms: number;

  @Column({ name: "area_total", type: "decimal", precision: 8, scale: 2, nullable: true })
  areaTotal: number;

  @Column({ name: "area_living", type: "decimal", precision: 8, scale: 2, nullable: true })
  areaLiving: number;

  @Column({ name: "area_kitchen", type: "decimal", precision: 8, scale: 2, nullable: true })
  areaKitchen: number;

  @Column({ nullable: true })
  floor: number;

  @Column({ name: "floor_total", nullable: true })
  floorTotal: number;

  @Column({ name: "building_type", nullable: true })
  buildingType: string;

  @Column({ name: "year_built", nullable: true })
  yearBuilt: number;

  @Column({ nullable: true })
  condition: string;

  @Column({ nullable: true })
  district: string;

  @Column({ type: "text", nullable: true })
  address: string;

  @Column({ name: "complex_name", nullable: true })
  complexName: string;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  lng: number;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: "seller_type", nullable: true })
  sellerType: string;

  @Column({ type: "text", array: true, default: "{}" })
  photos: string[];

  @Column({ name: "photo_hashes", type: "text", array: true, default: "{}" })
  photoHashes: string[];

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ name: "raw_data", type: "jsonb", nullable: true })
  rawData: Record<string, unknown>;

  @Column({ name: "score_total", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreTotal: number;

  @Column({ name: "score_commute", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreCommute: number;

  @Column({ name: "score_infrastructure", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreInfrastructure: number;

  @Column({ name: "score_lifestyle", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreLifestyle: number;

  @Column({ name: "score_value", type: "decimal", precision: 5, scale: 2, nullable: true })
  scoreValue: number;

  @Column({ name: "commute_minutes", nullable: true })
  commuteMinutes: number;

  @Column({ name: "commute_traffic_direction", nullable: true })
  commuteTrafficDirection: string;

  @Column({ name: "scoring_explanation", type: "text", nullable: true })
  scoringExplanation: string;

  @Column({ name: "group_id", nullable: true })
  groupId: string;

  @Column({ name: "is_primary", default: true })
  isPrimary: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => SearchProjectEntity, (project) => project.properties, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project: SearchProjectEntity;

  @ManyToOne(() => PropertyGroupEntity, (group) => group.properties)
  @JoinColumn({ name: "group_id" })
  group: PropertyGroupEntity;

  @OneToMany(() => CJMScenarioEntity, (scenario) => scenario.property)
  cjmScenarios: CJMScenarioEntity[];

  @OneToMany(() => WishlistItemEntity, (item) => item.property)
  wishlistItems: WishlistItemEntity[];
}
