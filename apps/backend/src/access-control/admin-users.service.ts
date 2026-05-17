import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, Brackets } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";

export interface AdminUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  phone: string | null;
  role: string;
  phoneVerified: boolean;
  searchEnabled: boolean;
  expertEnabled: boolean;
  createdAt: string;
}

/**
 * Admin-only view onto the users table. Powers the "Пользователи" tab
 * — paginated list + free-text search by phone or displayName + direct
 * flag toggles (admin can grant searchEnabled / expertEnabled without
 * waiting for the user to file an AccessRequest).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
  ) {}

  async list(opts: {
    page?: number;
    limit?: number;
    search?: string;
    filter?: "all" | "verified" | "search" | "expert" | "admin";
  }): Promise<{
    users: AdminUserDTO[];
    total: number;
    page: number;
    totalPages: number;
    stats: {
      total: number;
      verified: number;
      searchEnabled: number;
      expertEnabled: number;
    };
  }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 25));
    const filter = opts.filter || "all";

    const qb = this.usersRepo.createQueryBuilder("u");
    if (opts.search) {
      const term = `%${opts.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) =>
          sub
            .where("u.phone ILIKE :term", { term })
            .orWhere("u.displayName ILIKE :term", { term })
            .orWhere("u.username ILIKE :term", { term }),
        ),
      );
    }
    if (filter === "verified") qb.andWhere("u.phoneVerified = true");
    if (filter === "search") qb.andWhere("u.searchEnabled = true");
    if (filter === "expert") qb.andWhere("u.expertEnabled = true");
    if (filter === "admin") qb.andWhere("u.role = 'admin'");

    const [rows, total] = await qb
      .orderBy("u.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Compute top-level stats — cheap COUNT(*) per flag.
    const [statTotal, statVerified, statSearch, statExpert] = await Promise.all([
      this.usersRepo.count(),
      this.usersRepo.count({ where: { phoneVerified: true } }),
      this.usersRepo.count({ where: { searchEnabled: true } }),
      this.usersRepo.count({ where: { expertEnabled: true } }),
    ]);

    return {
      users: rows.map(toDTO),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        total: statTotal,
        verified: statVerified,
        searchEnabled: statSearch,
        expertEnabled: statExpert,
      },
    };
  }

  /** PATCH-style update of the access flags. Admin only; flags are
   *  the only fields editable here — no role escalation possible. */
  async updateFlags(
    userId: string,
    patch: {
      searchEnabled?: boolean;
      expertEnabled?: boolean;
      displayName?: string | null;
    },
  ): Promise<AdminUserDTO> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const updates: {
      searchEnabled?: boolean;
      expertEnabled?: boolean;
      displayName?: string | null;
    } = {};
    if (typeof patch.searchEnabled === "boolean")
      updates.searchEnabled = patch.searchEnabled;
    if (typeof patch.expertEnabled === "boolean")
      updates.expertEnabled = patch.expertEnabled;
    if (patch.displayName !== undefined) {
      const trimmed = (patch.displayName || "").trim().slice(0, 40);
      updates.displayName = trimmed || null;
    }
    if (Object.keys(updates).length > 0) {
      await this.usersRepo.update(userId, updates as any);
    }
    const fresh = await this.usersRepo.findOne({ where: { id: userId } });
    return toDTO(fresh!);
  }
}

function toDTO(u: UserEntity): AdminUserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || null,
    phone: u.phone || null,
    role: u.role,
    phoneVerified: u.phoneVerified,
    searchEnabled: u.searchEnabled,
    expertEnabled: u.expertEnabled,
    createdAt: u.createdAt.toISOString(),
  };
}
