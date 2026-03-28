import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { PropertyEntity } from "./property.entity";

@Entity("wishlist_items")
@Unique(["userId", "propertyId"])
export class WishlistItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "property_id" })
  propertyId: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.wishlistItems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @ManyToOne(() => PropertyEntity, (property) => property.wishlistItems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "property_id" })
  property: PropertyEntity;
}
