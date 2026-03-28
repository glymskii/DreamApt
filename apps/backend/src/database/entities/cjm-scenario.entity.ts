import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { PropertyEntity } from "./property.entity";

@Entity("cjm_scenarios")
export class CJMScenarioEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "property_id" })
  propertyId: string;

  @Column({ name: "scenario_type" })
  scenarioType: string;

  @Column()
  title: string;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "text", nullable: true })
  detail: string;

  @Column({ name: "time_slot", nullable: true })
  timeSlot: string;

  @Column({ type: "text", array: true, default: "{}" })
  tags: string[];

  @Column({ name: "match_score", type: "decimal", precision: 5, scale: 2, nullable: true })
  matchScore: number;

  @Column({ type: "jsonb", nullable: true, name: "nearby_places" })
  nearbyPlaces: { name: string; category: string; distanceMeters: number; address: string }[] | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => PropertyEntity, (property) => property.cjmScenarios, { onDelete: "CASCADE" })
  @JoinColumn({ name: "property_id" })
  property: PropertyEntity;
}
