import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WishlistController } from "./wishlist.controller";
import { WishlistService } from "./wishlist.service";
import { WishlistItemEntity } from "../database/entities/wishlist-item.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItemEntity, UserEntity]), AuthModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
