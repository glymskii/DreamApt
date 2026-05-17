import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ResidentialComplexEntity } from "./residential-complex.entity";
import { UserEntity } from "./user.entity";

/**
 * One user comment on a residential complex. Soft-deletable so deleting
 * a comment doesn't break a thread of replies (text replaced with
 * "[удалён]" client-side when deletedAt is set).
 *
 * `likesCount` is a denormalised counter — keeps the comment list query
 * cheap (no GROUP BY join with comment_likes on every fetch). Kept in
 * sync by the like/unlike service methods.
 */
@Entity("comments")
@Index("idx_comments_complex_created", ["complexId", "createdAt"])
@Index("idx_comments_user", ["userId"])
export class CommentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "complex_id" })
  complexId: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ type: "text" })
  text: string;

  /** Optional reply parent — flat threads only for MVP (one level deep).
   *  Explicit `type: "uuid"` because TypeScript reflection sees
   *  `string | null` as Object and TypeORM can't infer the Postgres type
   *  otherwise — schema sync would fail with DataTypeNotSupportedError. */
  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId: string | null;

  /** Denormalised counter, maintained by service.like / service.unlike. */
  @Column({ name: "likes_count", default: 0 })
  likesCount: number;

  @Column({ name: "edited_at", type: "timestamp", nullable: true })
  editedAt: Date | null;

  @Column({ name: "deleted_at", type: "timestamp", nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => ResidentialComplexEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "complex_id" })
  complex: ResidentialComplexEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
}
