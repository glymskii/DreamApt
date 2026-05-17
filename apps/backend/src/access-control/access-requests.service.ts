import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AccessRequestEntity,
  AccessRequestStatus,
  AccessRequestType,
} from "../database/entities/access-request.entity";
import { UserEntity } from "../database/entities/user.entity";

/** Shape we hand back to clients — drops admin-internal columns. */
export interface AccessRequestDTO {
  id: string;
  userId: string;
  type: AccessRequestType;
  status: AccessRequestStatus;
  message: string | null;
  createdAt: string;
  processedAt: string | null;
  user: {
    id: string;
    displayName: string;
    phone: string;
    phoneVerified: boolean;
    searchEnabled: boolean;
    expertEnabled: boolean;
    role: string;
  };
}

@Injectable()
export class AccessRequestsService {
  constructor(
    @InjectRepository(AccessRequestEntity)
    private requestsRepo: Repository<AccessRequestEntity>,
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
  ) {}

  /**
   * Create a new access request for the current user. Idempotent —
   * if the user already has a pending request of the same type, we
   * return it instead of creating a duplicate. Also short-circuits if
   * the user already has the requested flag granted.
   */
  async create(
    userId: string,
    type: AccessRequestType,
    message?: string,
  ): Promise<AccessRequestDTO> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new ForbiddenException("User not found");
    if (!user.phoneVerified) {
      throw new ForbiddenException(
        "Подтвердите номер через Telegram перед запросом доступа",
      );
    }

    // Already granted?
    if (type === "search" && user.searchEnabled) {
      throw new ConflictException("Доступ к поиску уже открыт");
    }
    if (type === "expert" && user.expertEnabled) {
      throw new ConflictException("Доступ к мнениям эксперта уже открыт");
    }

    // Existing pending request of same type? Return it (idempotency).
    const existing = await this.requestsRepo.findOne({
      where: { userId, type, status: "pending" },
      relations: ["user"],
    });
    if (existing) return toDTO(existing);

    const trimmed = (message || "").trim().slice(0, 500) || null;
    const saved = await this.requestsRepo.save({
      userId,
      type,
      status: "pending",
      message: trimmed,
    });
    const withUser = await this.requestsRepo.findOne({
      where: { id: saved.id },
      relations: ["user"],
    });
    return toDTO(withUser!);
  }

  /** User's own list — used by the dashboard to remember "you already
   *  requested" state across page loads. */
  async listMine(userId: string): Promise<AccessRequestDTO[]> {
    const rows = await this.requestsRepo.find({
      where: { userId },
      relations: ["user"],
      order: { createdAt: "DESC" },
    });
    return rows.map(toDTO);
  }

  /**
   * Admin list with filters. `status` = pending|approved|rejected|all,
   * `type` = search|expert|all. Default: pending+all-types — the inbox.
   */
  async listForAdmin(filters: {
    status?: AccessRequestStatus | "all";
    type?: AccessRequestType | "all";
  }): Promise<AccessRequestDTO[]> {
    const qb = this.requestsRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.user", "u")
      .orderBy("r.createdAt", "DESC");
    if (filters.status && filters.status !== "all") {
      qb.andWhere("r.status = :status", { status: filters.status });
    }
    if (filters.type && filters.type !== "all") {
      qb.andWhere("r.type = :type", { type: filters.type });
    }
    const rows = await qb.getMany();
    return rows.map(toDTO);
  }

  /**
   * Approve a request: flip the matching flag on the user + mark the
   * request approved. Single transaction so partial-failure doesn't
   * leave the user with the flag flipped but the request still pending
   * (or vice versa).
   */
  async approve(
    requestId: string,
    adminId: string,
    note?: string,
  ): Promise<AccessRequestDTO> {
    const req = await this.requestsRepo.findOne({
      where: { id: requestId },
      relations: ["user"],
    });
    if (!req) throw new NotFoundException("Request not found");
    if (req.status !== "pending") {
      throw new BadRequestException(`Request already ${req.status}`);
    }

    await this.requestsRepo.manager.transaction(async (mgr) => {
      const userPatch =
        req.type === "search"
          ? { searchEnabled: true }
          : { expertEnabled: true };
      await mgr.getRepository(UserEntity).update(req.userId, userPatch);
      await mgr.getRepository(AccessRequestEntity).update(req.id, {
        status: "approved",
        processedAt: new Date(),
        processedBy: adminId,
        adminNote: (note || "").trim().slice(0, 500) || null,
      });
    });

    const updated = await this.requestsRepo.findOne({
      where: { id: requestId },
      relations: ["user"],
    });
    return toDTO(updated!);
  }

  async reject(
    requestId: string,
    adminId: string,
    note?: string,
  ): Promise<AccessRequestDTO> {
    const req = await this.requestsRepo.findOne({
      where: { id: requestId },
      relations: ["user"],
    });
    if (!req) throw new NotFoundException("Request not found");
    if (req.status !== "pending") {
      throw new BadRequestException(`Request already ${req.status}`);
    }
    await this.requestsRepo.update(req.id, {
      status: "rejected",
      processedAt: new Date(),
      processedBy: adminId,
      adminNote: (note || "").trim().slice(0, 500) || null,
    });
    const updated = await this.requestsRepo.findOne({
      where: { id: requestId },
      relations: ["user"],
    });
    return toDTO(updated!);
  }
}

function authorLabel(u: UserEntity | undefined | null): string {
  if (!u) return "—";
  if (u.displayName) return u.displayName;
  if (u.phone) return `Аноним ··${u.phone.slice(-2)}`;
  return u.username || "—";
}

function toDTO(r: AccessRequestEntity): AccessRequestDTO {
  return {
    id: r.id,
    userId: r.userId,
    type: r.type,
    status: r.status,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
    user: {
      id: r.user?.id || r.userId,
      displayName: authorLabel(r.user),
      // Phone shown to ADMIN only (this endpoint is admin-gated)
      phone: r.user?.phone || "",
      phoneVerified: r.user?.phoneVerified ?? false,
      searchEnabled: r.user?.searchEnabled ?? false,
      expertEnabled: r.user?.expertEnabled ?? false,
      role: r.user?.role ?? "user",
    },
  };
}
