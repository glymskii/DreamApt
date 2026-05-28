import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CommentsService } from "./comments.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { OptionalJwtGuard } from "../auth/optional-jwt.guard";
import { AdminGuard } from "../auth/admin.guard";

class CreateCommentDto {
  @IsString()
  @MaxLength(1000)
  text: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

class EditCommentDto {
  @IsString()
  @MaxLength(1000)
  text: string;
}

/**
 * Public list + verified-only write/like endpoints. We accept the JWT
 * via OptionalJwtGuard on the list endpoint so the same handler can
 * compute isLikedByMe / isMine for logged-in viewers without forcing
 * guests to log in.
 */
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** Public list — anyone can read. Short s-maxage so likes don't appear
   *  to lag too much. */
  @Get("complexes/:id/comments")
  @UseGuards(OptionalJwtGuard)
  @Header("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30")
  async list(
    @Param("id") complexId: string,
    @Req() req: any,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.comments.listForComplex(complexId, {
      sort: sort === "top" ? "top" : "new",
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      viewerId: req.user?.id,
    });
  }

  /** Admin moderation feed — site-wide comment activity + headline
   *  counts. Lives above the public POST so the static "admin/comments"
   *  path is matched before the dynamic ":id" segment can't shadow it
   *  (different prefix anyway, but keep it grouped). */
  @Get("admin/comments")
  @UseGuards(AdminGuard)
  async recentForAdmin(@Query("limit") limit?: string) {
    return this.comments.listRecentForAdmin(limit ? parseInt(limit, 10) : 50);
  }

  /** Post a new comment. JwtAuthGuard ensures we have a user; the
   *  service re-checks phoneVerified. Rate-limit at 10/min per IP
   *  (service also enforces 5/min per user). */
  @Post("complexes/:id/comments")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async create(
    @Param("id") complexId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: any,
  ) {
    return this.comments.create(req.user.id, complexId, dto);
  }

  /** Owner-only edit, allowed only within the 10-minute window from
   *  createdAt (enforced in service). Admins cannot edit — rewriting other
   *  people's words is a moderation hazard; admins delete instead. */
  @Patch("comments/:id")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async edit(
    @Param("id") commentId: string,
    @Body() dto: EditCommentDto,
    @Req() req: any,
  ) {
    return this.comments.edit(req.user.id, commentId, dto.text);
  }

  /** Toggle like. Same rate-limit / verification rules as create. */
  @Post("comments/:id/like")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async like(@Param("id") commentId: string, @Req() req: any) {
    return this.comments.toggleLike(req.user.id, commentId);
  }

  /** Owner or admin can delete. Service handles the role check. */
  @Delete("comments/:id")
  @UseGuards(JwtAuthGuard)
  async delete(@Param("id") commentId: string, @Req() req: any) {
    if (!req.user?.id) throw new ForbiddenException();
    await this.comments.delete(req.user.id, commentId, req.user.role === "admin");
    return { ok: true };
  }
}
