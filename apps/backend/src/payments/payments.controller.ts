import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { PaymentsService } from "./payments.service";

class CheckoutDto {
  @IsString()
  @MaxLength(30)
  plan: string;
}

class InvoicedDto {
  /** Kaspi's operation number, if the admin wants to keep it. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalId?: string;
}

class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Plans and prices. PUBLIC: shown before sign-in. */
  @Get("payments/plans")
  plans() {
    return this.payments.plans();
  }

  @Post("payments/checkout")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  checkout(@Body() dto: CheckoutDto, @Req() req: any) {
    return this.payments.checkout(req.user.id, dto.plan);
  }

  @Get("payments/mine")
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: any) {
    return this.payments.listMine(req.user.id);
  }

  @Post("payments/:id/cancel")
  @UseGuards(JwtAuthGuard)
  cancelMine(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return this.payments.cancelMine(req.user.id, id);
  }

  // ── Admin ──

  /** ?status=open|paid|all (default open — the to-do list). */
  @Get("admin/payments")
  @UseGuards(AdminGuard)
  listAdmin(@Query("status") status?: string) {
    const filter = status === "paid" || status === "all" ? status : "open";
    return this.payments.listForAdmin(filter);
  }

  @Post("admin/payments/:id/invoiced")
  @UseGuards(AdminGuard)
  invoiced(@Param("id", ParseUUIDPipe) id: string, @Body() dto: InvoicedDto, @Req() req: any) {
    return this.payments.markInvoiced(id, req.user.id, dto.externalId);
  }

  @Post("admin/payments/:id/paid")
  @UseGuards(AdminGuard)
  paid(@Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto, @Req() req: any) {
    return this.payments.markPaid(id, req.user.id, dto.note);
  }

  @Post("admin/payments/:id/cancel")
  @UseGuards(AdminGuard)
  cancel(@Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto, @Req() req: any) {
    return this.payments.cancel(id, req.user.id, dto.note);
  }

  /** Ends a user's paid search access now. */
  @Post("admin/subscriptions/:userId/revoke")
  @UseGuards(AdminGuard)
  revoke(@Param("userId", ParseUUIDPipe) userId: string, @Req() req: any) {
    return this.payments.revokeSubscription(userId, req.user.id);
  }
}
