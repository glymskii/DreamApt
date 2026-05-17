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
import { UserEntity } from "./user.entity";

/**
 * One request from a phone-verified user to be granted an elevated
 * permission — either `search` (run the apartment-search pipeline) or
 * `expert` (view the Шутов expert ratings).
 *
 * Distinct from RegistrationLeadEntity (the legacy admin-approval-to-
 * register flow which OTP replaces). A user can have multiple requests
 * over time — we keep history rather than overwriting; the latest
 * pending one is what admin acts on.
 *
 * `status` transitions: pending → approved | rejected. On approval the
 * service flips the matching flag on UserEntity (searchEnabled or
 * expertEnabled) — the actual gate-check on the dashboard reads that
 * column, not this table.
 */
export type AccessRequestType = "search" | "expert";
export type AccessRequestStatus = "pending" | "approved" | "rejected";

@Entity("access_requests")
@Index("idx_access_requests_user", ["userId"])
@Index("idx_access_requests_status_type", ["status", "type"])
export class AccessRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ length: 10 })
  type: AccessRequestType;

  @Column({ length: 10, default: "pending" })
  status: AccessRequestStatus;

  /** Optional context from the user — "зачем нужен доступ" so admin
   *  can triage. Capped at 500 chars. */
  @Column({ type: "text", nullable: true })
  message: string | null;

  /** Admin's optional note when approving/rejecting — internal only. */
  @Column({ name: "admin_note", type: "text", nullable: true })
  adminNote: string | null;

  /** Timestamp + actor on the moment the request was decided. */
  @Column({ name: "processed_at", type: "timestamp", nullable: true })
  processedAt: Date | null;

  /** Admin who processed the request. Explicit `type: "uuid"` because
   *  `string | null` reflects as Object at runtime — without this TypeORM
   *  can't infer the Postgres column type. */
  @Column({ name: "processed_by", type: "uuid", nullable: true })
  processedBy: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
}
