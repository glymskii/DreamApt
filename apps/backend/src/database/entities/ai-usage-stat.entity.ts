import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  UpdateDateColumn,
} from "typeorm";

/** What an OpenAI call was for. */
export type AiPurpose = "expand" | "score" | "cjm";

/**
 * Hourly rollup of OpenAI usage — one row per (hour, purpose, model),
 * bumped by an UPSERT on every call (the same shape as request_stats).
 * Counts every call: the search pipeline's, and the ones made later when
 * a property page asks for life scenarios or a rescore.
 */
@Entity("ai_usage_stats")
@Unique("uq_ai_usage_bucket", ["hourBucket", "purpose", "model"])
@Index("idx_ai_usage_hour", ["hourBucket"])
export class AiUsageStatEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Start of the hour (UTC). */
  @Column({ name: "hour_bucket", type: "timestamp" })
  hourBucket: Date;

  @Column({ length: 20 })
  purpose: AiPurpose;

  @Column({ length: 60 })
  model: string;

  @Column({ type: "int", default: 0 })
  calls: number;

  @Column({ name: "prompt_tokens", type: "bigint", default: 0 })
  promptTokens: string;

  @Column({ name: "completion_tokens", type: "bigint", default: 0 })
  completionTokens: string;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
