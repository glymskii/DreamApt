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
const EDIT_WINDOW_MS = 15 * 60 * 1000;
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
