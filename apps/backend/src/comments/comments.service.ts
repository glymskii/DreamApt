import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, IsNull } from "typeorm";
import { CommentEntity } from "../database/entities/comment.entity";
import { CommentLikeEntity } from "../database/entities/comment-like.entity";
import { UserEntity } from "../database/entities/user.entity";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";

/** Public-facing comment shape. Sensitive fields (full phone, internal
 *  ids of other users) are stripped; we surface only what the UI shows. */
export interface CommentDTO {
  id: string;
  text: string;
  likesCount: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  parentId: string | null;
  author: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  };
  /** True if the current viewer has liked this comment. Always false
   *  for guests. */
  isLikedByMe: boolean;
  /** True if the current viewer owns this comment (controls delete UI). */
  isMine: boolean;
}

const MAX_TEXT_LEN = 1000;
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const POSTS_PER_MIN_PER_USER = 5;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private commentsRepo: Repository<CommentEntity>,
    @InjectRepository(CommentLikeEntity)
    private likesRepo: Repository<CommentLikeEntity>,
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
  ) {}

  /**
   * Page of comments for a complex. Includes author info + the viewer's
   * per-comment isLiked / isMine flags computed in a single round-trip
   * (we batch the liked-ids lookup so the list rendering is O(1) per row).
   */
  async listForComplex(
    complexId: string,
    opts: { sort?: "new" | "top"; page?: number; limit?: number; viewerId?: string },
  ): Promise<{ comments: CommentDTO[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const sort = opts.sort === "top" ? "top" : "new";

    const qb = this.commentsRepo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.user", "u")
      .where("c.complexId = :complexId", { complexId });
    if (sort === "top") {
      qb.orderBy("c.likesCount", "DESC").addOrderBy("c.createdAt", "DESC");
    } else {
      qb.orderBy("c.createdAt", "DESC");
    }
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Batch-fetch the viewer's likes for visible comment ids
    let likedSet = new Set<string>();
    if (opts.viewerId && rows.length > 0) {
      const likes = await this.likesRepo.find({
        where: { userId: opts.viewerId, commentId: In(rows.map((r) => r.id)) },
        select: ["commentId"],
      });
      likedSet = new Set(likes.map((l) => l.commentId));
    }

    return {
      total,
      page,
      totalPages: Math.ceil(total / limit),
      comments: rows.map((r) => toDTO(r, opts.viewerId, likedSet.has(r.id))),
    };
  }

  /**
   * Post a new comment. Requires the user to be phone-verified — checked
   * by the controller via PhoneVerifiedGuard, but we re-check here as a
   * defence-in-depth layer.
   *
   * Per-user rate limit: 5 posts/minute. Comment text is trimmed and
   * length-capped; whitespace-only posts get rejected.
   */
  async create(
    viewerId: string,
    complexId: string,
    input: { text: string; parentId?: string },
  ): Promise<CommentDTO> {
    const user = await this.usersRepo.findOne({ where: { id: viewerId } });
    if (!user) throw new ForbiddenException("User not found");
    if (!user.phoneVerified) {
      throw new ForbiddenException("Phone verification required to comment");
    }

    const text = (input.text || "").trim();
    if (!text) throw new BadRequestException("Comment cannot be empty");
    if (text.length > MAX_TEXT_LEN) {
      throw new BadRequestException(`Comment is longer than ${MAX_TEXT_LEN} chars`);
    }

    // Rate-limit: 5 comments/minute per user. Cheap COUNT against a
    // partial-time-window index — the (user_id) index suffices.
    const oneMinAgo = new Date(Date.now() - 60_000);
    const recent = await this.commentsRepo
      .createQueryBuilder("c")
      .where("c.userId = :uid", { uid: viewerId })
      .andWhere("c.createdAt > :since", { since: oneMinAgo })
      .getCount();
    if (recent >= POSTS_PER_MIN_PER_USER) {
      throw new BadRequestException(
        "Слишком частые сообщения. Подождите немного.",
      );
    }

    // Parent must exist + belong to same complex if given
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.commentsRepo.findOne({
        where: { id: input.parentId, complexId },
      });
      if (!parent) throw new BadRequestException("Parent comment not found");
      // Cap thread depth at 1 — keeps UI flat
      parentId = parent.parentId || parent.id;
    }

    const saved = await this.commentsRepo.save({
      complexId,
      userId: viewerId,
      text,
      parentId,
      likesCount: 0,
    });
    // Reload with user relation for the DTO
    const withUser = await this.commentsRepo.findOne({
      where: { id: saved.id },
      relations: ["user"],
    });
    return toDTO(withUser!, viewerId, false);
  }

  /**
   * Edit an existing comment. Owner-only, even admin can't rewrite someone
   * else's words — that would be a moderation hazard. Editing window is 10
   * minutes from createdAt; past that the comment is frozen (users can
   * still delete). Same text validation as on create.
   */
  async edit(
    viewerId: string,
    commentId: string,
    newText: string,
  ): Promise<CommentDTO> {
    const c = await this.commentsRepo.findOne({
      where: { id: commentId },
      relations: ["user"],
    });
    if (!c) throw new NotFoundException("Comment not found");
    if (c.userId !== viewerId) {
      throw new ForbiddenException("Cannot edit someone else's comment");
    }
    if (c.deletedAt) {
      throw new BadRequestException("Cannot edit a deleted comment");
    }
    const ageMs = Date.now() - new Date(c.createdAt).getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException({
        message: "Окно редактирования истекло (10 минут после публикации)",
        code: "EDIT_WINDOW_EXPIRED",
      });
    }
    const text = (newText || "").trim();
    if (!text) throw new BadRequestException("Comment cannot be empty");
    if (text.length > MAX_TEXT_LEN) {
      throw new BadRequestException(`Comment is longer than ${MAX_TEXT_LEN} chars`);
    }
    if (text === c.text) {
      // No-op edit — return the existing DTO so the client UI can close
      // its editor without flashing an error.
      return toDTO(c, viewerId, await this.viewerLikes(viewerId, c.id));
    }
    await this.commentsRepo.update(c.id, {
      text,
      editedAt: new Date(),
    });
    const fresh = await this.commentsRepo.findOne({
      where: { id: c.id },
      relations: ["user"],
    });
    return toDTO(fresh!, viewerId, await this.viewerLikes(viewerId, c.id));
  }

  /** Helper: did this viewer like this comment? Used by edit() so the
   *  returned DTO carries the right heart state without re-fetching the
   *  whole list. */
  private async viewerLikes(
    viewerId: string | undefined,
    commentId: string,
  ): Promise<boolean> {
    if (!viewerId) return false;
    const hit = await this.likesRepo.findOne({
      where: { userId: viewerId, commentId },
      select: ["id"],
    });
    return !!hit;
  }

  /**
   * Soft-delete a comment. Owner can always delete; admin can delete any.
   * We don't free the row so any reply chain stays intact (text becomes
   * "[удалён]" client-side based on the deletedAt flag).
   */
  async delete(viewerId: string, commentId: string, isAdmin: boolean): Promise<void> {
    const c = await this.commentsRepo.findOne({ where: { id: commentId } });
    if (!c) throw new NotFoundException("Comment not found");
    if (!isAdmin && c.userId !== viewerId) {
      throw new ForbiddenException("Cannot delete someone else's comment");
    }
    if (c.deletedAt) return; // already deleted, no-op
    await this.commentsRepo.update(c.id, {
      deletedAt: new Date(),
      // Wipe text to keep the row light + prevent moderation leaks
      text: "",
    });
  }

  /**
   * Toggle a like. Returns the new likesCount and the new isLiked state
   * so the frontend can swap UI without a refetch. Counter increment is
   * a separate UPDATE on the comment row.
   */
  async toggleLike(
    viewerId: string,
    commentId: string,
  ): Promise<{ likesCount: number; isLikedByMe: boolean }> {
    const user = await this.usersRepo.findOne({ where: { id: viewerId } });
    if (!user) throw new ForbiddenException("User not found");
    if (!user.phoneVerified) {
      throw new ForbiddenException("Phone verification required to like");
    }

    const c = await this.commentsRepo.findOne({ where: { id: commentId } });
    if (!c) throw new NotFoundException("Comment not found");

    const existing = await this.likesRepo.findOne({
      where: { commentId, userId: viewerId },
    });

    if (existing) {
      await this.likesRepo.delete(existing.id);
      // Guard against negative counter from any race condition with deletes
      const newCount = Math.max(0, c.likesCount - 1);
      await this.commentsRepo.update(c.id, { likesCount: newCount });
      return { likesCount: newCount, isLikedByMe: false };
    } else {
      await this.likesRepo.save({ commentId, userId: viewerId });
      const newCount = c.likesCount + 1;
      await this.commentsRepo.update(c.id, { likesCount: newCount });
      return { likesCount: newCount, isLikedByMe: true };
    }
  }

  /**
   * Admin moderation feed: site-wide comment activity. Returns headline
   * counts + the N most recent comments with author + ЖК context so the
   * admin can eyeball who's posting what without clicking into every
   * complex. Phone is included here (admin-only endpoint) to help
   * identify the author beyond the anonymised public label.
   */
  async listRecentForAdmin(limit = 50): Promise<{
    total: number;
    active: number;
    deleted: number;
    authors: number;
    recent: Array<{
      id: string;
      complexId: string;
      complexName: string;
      complexDistrict: string | null;
      text: string | null;
      authorName: string;
      authorPhone: string | null;
      likesCount: number;
      createdAt: string;
      editedAt: string | null;
      deletedAt: string | null;
    }>;
  }> {
    const take = Math.min(200, Math.max(1, limit));
    const [total, active] = await Promise.all([
      this.commentsRepo.count(),
      this.commentsRepo.count({ where: { deletedAt: IsNull() } }),
    ]);

    // Distinct author count — one cheap grouped query.
    const authorRows = await this.commentsRepo
      .createQueryBuilder("c")
      .select("COUNT(DISTINCT c.userId)", "n")
      .getRawOne<{ n: string }>();
    const authors = parseInt(authorRows?.n || "0", 10);

    const rows = await this.commentsRepo.find({
      relations: ["user"],
      order: { createdAt: "DESC" },
      take,
    });

    // Batch-resolve ЖК names in one query rather than N lookups.
    const complexIds = [...new Set(rows.map((r) => r.complexId))];
    const complexes = complexIds.length
      ? await this.complexesRepo.find({
          where: { id: In(complexIds) },
          select: ["id", "name", "displayName", "district"],
        })
      : [];
    const cxMap = new Map(complexes.map((c) => [c.id, c]));

    return {
      total,
      active,
      deleted: total - active,
      authors,
      recent: rows.map((c) => {
        const cx = cxMap.get(c.complexId);
        return {
          id: c.id,
          complexId: c.complexId,
          complexName: cx?.displayName || cx?.name || "—",
          complexDistrict: cx?.district || null,
          text: c.deletedAt ? null : c.text,
          authorName: authorLabel(c.user),
          authorPhone: c.user?.phone || null,
          likesCount: c.likesCount,
          createdAt: c.createdAt.toISOString(),
          editedAt: c.editedAt ? c.editedAt.toISOString() : null,
          deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        };
      }),
    };
  }

  /** Comment counts per complex — small batch endpoint used by the
   *  slide-over to decide whether to even show the comments tab. */
  async countsByComplex(complexIds: string[]): Promise<Record<string, number>> {
    if (complexIds.length === 0) return {};
    const rows = await this.commentsRepo
      .createQueryBuilder("c")
      .select("c.complexId", "complexId")
      .addSelect("COUNT(*)", "count")
      .where("c.complexId IN (:...ids)", { ids: complexIds })
      .andWhere("c.deletedAt IS NULL")
      .groupBy("c.complexId")
      .getRawMany();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.complexId] = parseInt(r.count, 10);
    return out;
  }

  /**
   * Latest non-deleted comment per complex — feeds the map hover "хлебная
   * крошка" so users see there's a discussion (or a nudge to start one).
   * Postgres DISTINCT ON keeps it to one row per complex in a single
   * query. Returns { complexId: { text, author, count } }.
   */
  async latestByComplex(
    complexIds: string[],
  ): Promise<Record<string, { text: string; author: string; count: number }>> {
    if (complexIds.length === 0) return {};
    const counts = await this.countsByComplex(complexIds);
    const rows = await this.commentsRepo
      .createQueryBuilder("c")
      .leftJoin("c.user", "u")
      .select([
        "c.complexId AS complex_id",
        "c.text AS text",
        "u.displayName AS display_name",
        "u.phone AS phone",
      ])
      .distinctOn(["c.complexId"])
      .where("c.complexId IN (:...ids)", { ids: complexIds })
      .andWhere("c.deletedAt IS NULL")
      .orderBy("c.complexId")
      .addOrderBy("c.createdAt", "DESC")
      .getRawMany();

    const out: Record<string, { text: string; author: string; count: number }> = {};
    for (const r of rows) {
      const author = r.display_name
        ? r.display_name
        : r.phone
          ? `Аноним ··${String(r.phone).slice(-2)}`
          : "Аноним";
      out[r.complex_id] = {
        text: r.text || "",
        author,
        count: counts[r.complex_id] || 1,
      };
    }
    return out;
  }
}

/** Anonymise: prefer displayName, else derive last-2-digits hint from phone. */
function authorLabel(user: UserEntity | undefined | null): string {
  if (!user) return "Аноним";
  if (user.displayName) return user.displayName;
  if (user.phone) return `Аноним ··${user.phone.slice(-2)}`;
  return "Аноним";
}

function toDTO(
  c: CommentEntity,
  viewerId: string | undefined,
  liked: boolean,
): CommentDTO {
  return {
    id: c.id,
    // Soft-deleted: empty out the body — UI shows "[удалён]"
    text: c.deletedAt ? "" : c.text,
    likesCount: c.likesCount,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    parentId: c.parentId,
    author: {
      id: c.userId,
      displayName: authorLabel(c.user),
      isAdmin: c.user?.role === "admin",
    },
    isLikedByMe: liked,
    isMine: !!viewerId && c.userId === viewerId,
  };
}
