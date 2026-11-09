import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

export type SearchRunStatus = "running" | "done" | "empty" | "failed";
export type SearchRunUserType = "guest" | "user" | "admin";

/**
 * One launch of the search pipeline, for the admin analytics: who searched
 * (a guest or an account), how it ended, and the OpenAI tokens the
 * pipeline spent. Kept apart from the project so the count survives a
 * deleted search; also the record the daily search limit is counted from.
 */
@Entity("search_runs")
@Index("idx_search_runs_started", ["startedAt"])
@Index("idx_search_runs_user", ["userId"])
@Index("idx_search_runs_ip", ["ipHash"])
export class SearchRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "project_id", type: "uuid" })
  projectId: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  @Column({ name: "guest_id", type: "uuid", nullable: true })
  guestId: string | null;

  @Column({ name: "user_type", length: 10 })
  userType: SearchRunUserType;

  /** Salted hash of the client IP: guests are limited per address without
   *  the address itself being stored. */
  @Column({ name: "ip_hash", type: "varchar", length: 64, nullable: true })
  ipHash: string | null;

  @Column({ length: 10, default: "running" })
  status: SearchRunStatus;

  @Column({ name: "property_count", type: "int", default: 0 })
  propertyCount: number;

  /** OpenAI calls the pipeline made, and their tokens. */
  @Column({ name: "ai_calls", type: "int", default: 0 })
  aiCalls: number;

  @Column({ name: "prompt_tokens", type: "int", default: 0 })
  promptTokens: number;

  @Column({ name: "completion_tokens", type: "int", default: 0 })
  completionTokens: number;

  @CreateDateColumn({ name: "started_at" })
  startedAt: Date;

  @Column({ name: "finished_at", type: "timestamp", nullable: true })
  finishedAt: Date | null;
}
