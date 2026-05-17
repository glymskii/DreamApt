import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import {
  AccessRequestsService,
} from "./access-requests.service";
import type {
  AccessRequestType,
  AccessRequestStatus,
} from "../database/entities/access-request.entity";

class CreateAccessRequestDto {
  @IsIn(["search", "expert"])
  type: AccessRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

class DecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller()
export class AccessRequestsController {
  constructor(private readonly svc: AccessRequestsService) {}

  /** User submits a new access request. Rate-limited (3/min/IP) — the
   *  service also enforces idempotency per (user, type). */
  @Post("access-requests")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async create(@Body() dto: CreateAccessRequestDto, @Req() req: any) {
    return this.svc.create(req.user.id, dto.type, dto.message);
  }

  /** User's own request history — drives the "уже подали" UI state. */
  @Get("access-requests/mine")
  @UseGuards(JwtAuthGuard)
  async mine(@Req() req: any) {
    return this.svc.listMine(req.user.id);
  }

  // ── Admin ──

  /** Filterable inbox: ?status=pending&type=search etc. */
  @Get("admin/access-requests")
  @UseGuards(AdminGuard)
  async listAdmin(
    @Query("status") status?: string,
    @Query("type") type?: string,
  ) {
    return this.svc.listForAdmin({
      status: (status as AccessRequestStatus | "all" | undefined) || "pending",
      type: (type as AccessRequestType | "all" | undefined) || "all",
    });
  }

  @Post("admin/access-requests/:id/approve")
  @UseGuards(AdminGuard)
  async approve(
    @Param("id") id: string,
    @Body() dto: DecisionDto,
    @Req() req: any,
  ) {
    return this.svc.approve(id, req.user.id, dto.note);
  }

  @Post("admin/access-requests/:id/reject")
  @UseGuards(AdminGuard)
  async reject(
    @Param("id") id: string,
    @Body() dto: DecisionDto,
    @Req() req: any,
  ) {
    return this.svc.reject(id, req.user.id, dto.note);
  }
}
