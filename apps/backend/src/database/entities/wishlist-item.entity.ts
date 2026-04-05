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
import { ResidentialComplexEntity } from "./residential-complex.entity";

@Entity("wishlist_items")
@Unique(["userId", "complexId"])
export class WishlistItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "property_id", nullable: true })
  propertyId: string;

  @Column({ name: "complex_id", nullable: true })
  complexId: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.wishlistItems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @ManyToOne(() => PropertyEntity, (property) => property.wishlistItems, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "property_id" })
  property: PropertyEntity;

  @ManyToOne(() => ResidentialComplexEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "complex_id" })
  complex: ResidentialComplexEntity;
}
