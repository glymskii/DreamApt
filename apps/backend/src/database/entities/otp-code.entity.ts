import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from "typeorm";

/**
 * One Telegram-OTP registration attempt.
 *
 * Lifecycle:
 *  1. Frontend POST /auth/otp/request {phone} → row created with
 *     `phone`, generated `code` (6 digits) and `sessionToken` (random
 *     hex, ~22 chars). `expiresAt` = now + 10 min. `chatId` is null.
 *  2. User clicks the Telegram deeplink → bot receives /start
 *     <sessionToken> → backend finds this row by sessionToken,
 *     populates `chatId` and `codeSentAt`, and the bot DMs the code
 *     to that chat.
 *  3. User types the code on the frontend → POST /auth/otp/verify
 *     {phone, code} → backend matches the most recent unverified row
 *     for `phone`, checks code + expiry + attempts, marks
 *     `verifiedAt` and creates the UserEntity.
 *
 * Cleanup: a daily cron deletes rows older than 24h (verified or not)
 * — done by OtpService.prune.
 */
@Entity("otp_codes")
@Unique("uq_otp_session", ["sessionToken"])
@Index("idx_otp_phone", ["phone"])
@Index("idx_otp_expires", ["expiresAt"])
export class OtpCodeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  phone: string;

  /** 6-digit numeric code sent to the user via Telegram. */
  @Column({ length: 8 })
  code: string;

  /** Random URL-safe token passed via /start payload in the Telegram
   *  deeplink. Unique per OTP attempt so concurrent attempts can't
   *  cross-contaminate. */
  @Column({ name: "session_token" })
  sessionToken: string;

  /** Telegram chat id once the user starts the bot — bigint because
   *  Telegram chat ids can exceed int32 range. Stored as string in JS
   *  to avoid Number-precision loss for large ids. */
  @Column({ name: "chat_id", type: "bigint", nullable: true })
  chatId: string | null;

  /** When the bot actually DMed the code. Useful to detect "user
   *  requested but never opened the bot" vs "code sent but not used". */
  @Column({ name: "code_sent_at", type: "timestamp", nullable: true })
  codeSentAt: Date | null;

  /** When verifyOtp accepted this code. Once set, the row can't be
   *  reused — verify always looks for `verifiedAt IS NULL`. */
  @Column({ name: "verified_at", type: "timestamp", nullable: true })
  verifiedAt: Date | null;

  /** Hard expiry — 10 min by default. Verify rejects past expiresAt. */
  @Column({ name: "expires_at", type: "timestamp" })
  expiresAt: Date;

  /** Rate-limits brute-force on the 6-digit code. After 5 wrong tries
   *  the row is considered burnt; the user must request a new OTP. */
  @Column({ default: 0 })
  attempts: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
