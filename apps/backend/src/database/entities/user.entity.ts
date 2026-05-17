import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { SearchProjectEntity } from "./search-project.entity";
import { WishlistItemEntity } from "./wishlist-item.entity";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ name: "password_hash" })
  passwordHash: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: "google_id", nullable: true })
  googleId: string;

  @Column({ name: "avatar_url", nullable: true })
  avatarUrl: string;

  /** Display name shown in the public UGC surface (comments, likes).
   *  Optional — when empty, the comments API anonymises to "Аноним ··XX"
   *  (last 2 digits of phone). Users can pick a name later. */
  @Column({ name: "display_name", nullable: true, length: 40 })
  displayName: string;

  @Column({ default: "user" })
  role: string; // "admin" | "user"

  /** Phone has been verified through a Telegram OTP exchange. Used as a
   *  gate for commenting / liking (the UGC features) — confirms the
   *  account belongs to a real human who can receive Telegram messages. */
  @Column({ name: "phone_verified", default: false })
  phoneVerified: boolean;

  /** Admin has granted access to the search / interview pipeline. */
  @Column({ name: "search_enabled", default: false })
  searchEnabled: boolean;

  /** Admin has granted access to expert opinions (Шутов rating etc). */
  @Column({ name: "expert_enabled", default: false })
  expertEnabled: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToMany(() => SearchProjectEntity, (project) => project.user)
  projects: SearchProjectEntity[];

  @OneToMany(() => WishlistItemEntity, (item) => item.user)
  wishlistItems: WishlistItemEntity[];
}
