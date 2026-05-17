import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CommentEntity } from "./comment.entity";
import { UserEntity } from "./user.entity";

/**
 * One user "heart" on one comment. Unique on (commentId, userId) so a
 * user can like a comment exactly once — the like endpoint is a toggle:
 * insert if missing, delete if present, and bump comment.likesCount
 * accordingly.
 */
@Entity("comment_likes")
@Unique("uq_comment_likes_user", ["commentId", "userId"])
@Index("idx_comment_likes_user", ["userId"])
export class CommentLikeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "comment_id" })
  commentId: string;

  @Column({ name: "user_id" })
  userId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => CommentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "comment_id" })
  comment: CommentEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
}
