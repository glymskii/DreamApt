import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { SearchProjectEntity } from "./search-project.entity";
import { PropertyEntity } from "./property.entity";

@Entity("property_groups")
export class PropertyGroupEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "project_id" })
  projectId: string;

  @Column({ name: "dedup_reason", nullable: true })
  dedupReason: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => SearchProjectEntity, (project) => project.propertyGroups, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project: SearchProjectEntity;

  @OneToMany(() => PropertyEntity, (property) => property.group)
  properties: PropertyEntity[];
}
