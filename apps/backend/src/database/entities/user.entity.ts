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

  @Column({ default: "user" })
  role: string; // "admin" | "user"

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToMany(() => SearchProjectEntity, (project) => project.user)
  projects: SearchProjectEntity[];

  @OneToMany(() => WishlistItemEntity, (item) => item.user)
  wishlistItems: WishlistItemEntity[];
}
