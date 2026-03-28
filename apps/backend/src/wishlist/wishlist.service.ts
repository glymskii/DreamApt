import { Injectable, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WishlistItemEntity } from "../database/entities/wishlist-item.entity";

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItemEntity)
    private wishlistRepo: Repository<WishlistItemEntity>,
  ) {}

  async findByUser(userId: string) {
    return {
      items: await this.wishlistRepo.find({
        where: { userId },
        relations: ["property"],
        order: { createdAt: "DESC" },
      }),
    };
  }

  async add(userId: string, propertyId: string) {
    const existing = await this.wishlistRepo.findOne({
      where: { userId, propertyId },
    });
    if (existing) throw new ConflictException("Already in wishlist");

    const item = this.wishlistRepo.create({ userId, propertyId });
    return this.wishlistRepo.save(item);
  }

  async remove(userId: string, propertyId: string) {
    await this.wishlistRepo.delete({ userId, propertyId });
    return { success: true };
  }

  async isWishlisted(userId: string, propertyIds: string[]): Promise<Set<string>> {
    if (!propertyIds.length) return new Set();
    const items = await this.wishlistRepo
      .createQueryBuilder("w")
      .where("w.userId = :userId", { userId })
      .andWhere("w.propertyId IN (:...propertyIds)", { propertyIds })
      .getMany();
    return new Set(items.map((i) => i.propertyId));
  }
}
