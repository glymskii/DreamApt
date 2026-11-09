import { Injectable, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WishlistItemEntity } from "../database/entities/wishlist-item.entity";
import { UserEntity } from "../database/entities/user.entity";
import { omitShutov, shutovLockFor } from "../access-control/shutov-access";

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItemEntity)
    private wishlistRepo: Repository<WishlistItemEntity>,
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
  ) {}

  async findByUser(userId: string) {
    const items = await this.wishlistRepo.find({
      where: { userId },
      relations: ["property", "complex"],
      order: { createdAt: "DESC" },
    });
    // A wishlisted ЖК carries its Шутов category only for subscribers.
    if (!(await shutovLockFor(this.usersRepo, { id: userId }))) return { items };
    return {
      items: items.map((item) => (item.complex ? { ...item, complex: omitShutov(item.complex) } : item)),
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

  async addComplex(userId: string, complexId: string) {
    const existing = await this.wishlistRepo.findOne({
      where: { userId, complexId },
    });
    if (existing) throw new ConflictException("Already in wishlist");

    const item = this.wishlistRepo.create({ userId, complexId });
    return this.wishlistRepo.save(item);
  }

  async removeComplex(userId: string, complexId: string) {
    await this.wishlistRepo.delete({ userId, complexId });
    return { success: true };
  }

  async isComplexWishlisted(userId: string, complexId: string): Promise<boolean> {
    const item = await this.wishlistRepo.findOne({
      where: { userId, complexId },
    });
    return !!item;
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
