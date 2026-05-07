import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Pre-registration lead. A guest leaves their phone number and waits for the
 * admin to approve them. On approval the admin generates a token; the guest
 * visits /auth/register/:token and sets their password — at that point a real
 * UserEntity is created and the lead is marked completed.
 *
 * Phone is stored in normalized E.164 form (+77051234567).
 */
@Entity("registration_leads")
@Index("idx_leads_status", ["status"])
export class RegistrationLeadEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ default: "pending" })
  status: string; // pending | approved | completed | rejected

  @Column({ nullable: true })
  token: string; // 32-byte random hex, set on approve

  @Column({ name: "token_expires_at", type: "timestamp", nullable: true })
  tokenExpiresAt: Date;

  @Column({ type: "text", nullable: true })
  note: string; // optional admin note

  @Column({ name: "approved_at", type: "timestamp", nullable: true })
  approvedAt: Date;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
