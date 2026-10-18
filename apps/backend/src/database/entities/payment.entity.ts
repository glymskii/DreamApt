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
 * One purchase of paid access, e.g. «поиск на 30 дней».
 *
 * `status` transitions:
 *   pending  → the user asked to pay; nobody has billed them yet
 *   invoiced → a Kaspi invoice went to their phone
 *   paid     → money confirmed; the user's access was extended
 *   cancelled / expired → closed without payment
 *
 * `provider` names who billed the user: "kaspi_manual" is an admin issuing
 * the invoice in the Kaspi Pay app by hand. An automated provider fills
 * `externalId` with its own operation id.
 */
export type PaymentStatus = "pending" | "invoiced" | "paid" | "cancelled" | "expired";
export type PaymentFeature = "search";

export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = ["pending", "invoiced"];

@Entity("payments")
@Index("idx_payments_user", ["userId"])
@Index("idx_payments_status", ["status"])
export class PaymentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id" })
  userId: string;

  /** Plan id at purchase time, e.g. "search-30d". */
  @Column({ length: 30 })
  plan: string;

  @Column({ length: 20 })
  feature: PaymentFeature;

  /** Price in tenge, fixed when the payment was created. */
  @Column({ type: "int" })
  amount: number;

  /** Days of access the payment buys. */
  @Column({ type: "int" })
  days: number;

  /** Kaspi number the invoice goes to, E.164. */
  @Column({ length: 20 })
  phone: string;

  @Column({ length: 20, default: "kaspi_manual" })
  provider: string;

  @Column({ length: 10, default: "pending" })
  status: PaymentStatus;

  /** The provider's id for the invoice (Kaspi operation number). */
  @Column({ name: "external_id", type: "varchar", length: 64, nullable: true })
  externalId: string | null;

  @Column({ name: "invoiced_at", type: "timestamp", nullable: true })
  invoicedAt: Date | null;

  @Column({ name: "paid_at", type: "timestamp", nullable: true })
  paidAt: Date | null;

  /** When it was cancelled or expired. */
  @Column({ name: "closed_at", type: "timestamp", nullable: true })
  closedAt: Date | null;

  /** The end of access this payment extended the user to. */
  @Column({ name: "access_until", type: "timestamp", nullable: true })
  accessUntil: Date | null;

  /** Admin who confirmed or cancelled it; null when the provider did. */
  @Column({ name: "processed_by", type: "uuid", nullable: true })
  processedBy: string | null;

  @Column({ name: "admin_note", type: "text", nullable: true })
  adminNote: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
}
