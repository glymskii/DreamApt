import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { PropertyEntity } from "./property.entity";
import { ResidentialComplexEntity } from "./residential-complex.entity";

@Entity("search_projects")
export class SearchProjectEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column()
  name: string;

  @Column({ default: "draft" })
  status: string;

  @Column({ name: "interview_answers", type: "jsonb", nullable: true })
  interviewAnswers: Record<string, unknown>;

  @Column({ name: "search_params", type: "jsonb", nullable: true })
  searchParams: Record<string, unknown>;

  @Column({ name: "ai_suggestions", type: "text", nullable: true })
  aiSuggestions: string;

  @Column({ name: "property_count", default: 0 })
  propertyCount: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.projects, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @OneToMany(() => PropertyEntity, (property) => property.project)
  properties: PropertyEntity[];

  @OneToMany(() => ResidentialComplexEntity, (complex) => complex.project)
  complexes: ResidentialComplexEntity[];
}
