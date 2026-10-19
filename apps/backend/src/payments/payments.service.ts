import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Cron } from "@nestjs/schedule";
import { In, LessThan, Repository } from "typeorm";
import {
  OPEN_PAYMENT_STATUSES,
  PaymentEntity,
  PaymentFeature,
  PaymentStatus,
} from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { TelegramService } from "../telegram/telegram.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./providers/payment-provider";
import { formatDay, formatTenge } from "./payment-format";

export interface PaymentPlan {
  id: string;
  feature: PaymentFeature;
  days: number;
  /** Tenge. */
  amount: number;
}

export interface PaymentDTO {
  id: string;
  plan: string;
  feature: PaymentFeature;
  amount: number;
  days: number;
  phone: string;
  provider: string;
  status: PaymentStatus;
  externalId: string | null;
  createdAt: string;
  invoicedAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  accessUntil: string | null;
}

export interface AdminPaymentDTO extends PaymentDTO {
  adminNote: string | null;
  user: {
    id: string;
    displayName: string;
    phone: string;
    searchPaidUntil: string | null;
  };
}

/** Open payments older than this close as expired: a Kaspi invoice
 *  nobody paid in a week won't be. */
const OPEN_PAYMENT_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_RU: Record<PaymentStatus, string> = {
  pending: "ожидает счёта",
  invoiced: "со счётом",
  paid: "оплачен",
  cancelled: "отменён",
  expired: "истёк",
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Search access plan; price and length come from the environment.
 *  Default: 4 990 ₸ for three months (90 days). */
export function searchPlan(): PaymentPlan {
  const days = positiveInt(process.env.SEARCH_PLAN_DAYS, 90);
  return {
    id: `search-${days}d`,
    feature: "search",
    days,
    amount: positiveInt(process.env.SEARCH_PLAN_PRICE_KZT, 4990),
  };
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

function toDTO(p: PaymentEntity): PaymentDTO {
  return {
    id: p.id,
    plan: p.plan,
    feature: p.feature,
    amount: p.amount,
    days: p.days,
    phone: p.phone,
    provider: p.provider,
    status: p.status,
    externalId: p.externalId,
    createdAt: iso(p.createdAt)!,
    invoicedAt: iso(p.invoicedAt),
    paidAt: iso(p.paidAt),
    closedAt: iso(p.closedAt),
    accessUntil: iso(p.accessUntil),
  };
}

function toAdminDTO(p: PaymentEntity): AdminPaymentDTO {
  return {
    ...toDTO(p),
    adminNote: p.adminNote,
    user: {
      id: p.user?.id ?? p.userId,
      displayName: p.user?.displayName || p.user?.username || "",
      phone: p.user?.phone ?? p.phone,
      searchPaidUntil: iso(p.user?.searchPaidUntil),
    },
  };
}

/**
 * Paid access, provider-agnostic: the user asks to pay, the provider bills
 * them, and once the money is confirmed (by an admin today, by the
 * provider's own status later) the user's access is extended.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
    @Inject(PAYMENT_PROVIDER)
    private provider: PaymentProvider,
    private telegram: TelegramService,
  ) {}

  plans(): PaymentPlan[] {
    return [searchPlan()];
  }

  /**
   * Start paying for a plan. Idempotent: while an earlier payment is still
   * open the user gets that one back, so a double click never bills twice.
   */
  async checkout(userId: string, planId: string): Promise<PaymentDTO> {
    const plan = this.plans().find((p) => p.id === planId);
    if (!plan) throw new BadRequestException("Тариф не найден");

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new ForbiddenException("User not found");
    if (!user.phoneVerified || !user.phone) {
      throw new ForbiddenException("Подтвердите номер через Telegram перед оплатой");
    }

    const open = await this.paymentsRepo.findOne({
      where: { userId, feature: plan.feature, status: In(OPEN_PAYMENT_STATUSES) },
      order: { createdAt: "DESC" },
    });
    if (open) return toDTO(open);

    const payment = await this.paymentsRepo.save(
      this.paymentsRepo.create({
        userId,
        plan: plan.id,
        feature: plan.feature,
        amount: plan.amount,
        days: plan.days,
        phone: user.phone,
        provider: this.provider.id,
        status: "pending",
      }),
    );

    const result = await this.provider.requestPayment(payment, user);
    if (result.status === "invoiced" || result.externalId) {
      payment.status = result.status;
      payment.externalId = result.externalId ?? null;
      payment.invoicedAt = result.status === "invoiced" ? new Date() : null;
      await this.paymentsRepo.save(payment);
    }
    return toDTO(payment);
  }

  async listMine(userId: string): Promise<PaymentDTO[]> {
    const rows = await this.paymentsRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: 10,
    });
    return rows.map(toDTO);
  }

  async cancelMine(userId: string, paymentId: string): Promise<PaymentDTO> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId, userId } });
    if (!payment) throw new NotFoundException("Платёж не найден");
    // Once the invoice is out it lives in Kaspi: the user declines it there,
    // and a payment that still arrives can be credited.
    if (payment.status === "invoiced") {
      throw new BadRequestException("Счёт уже выставлен — отклоните его в приложении Kaspi");
    }
    return toDTO(await this.close(payment, "cancelled", null));
  }

  // ── Admin ──

  async listForAdmin(filter: "open" | "paid" | "all"): Promise<AdminPaymentDTO[]> {
    const where =
      filter === "open" ? { status: In(OPEN_PAYMENT_STATUSES) }
        : filter === "paid" ? { status: "paid" as PaymentStatus }
          : {};
    const rows = await this.paymentsRepo.find({
      where,
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: 200,
    });
    return rows.map(toAdminDTO);
  }

  /** The admin has sent the Kaspi invoice. */
  async markInvoiced(paymentId: string, adminId: string, externalId?: string): Promise<AdminPaymentDTO> {
    const payment = await this.findForAdmin(paymentId);
    if (payment.status !== "pending") {
      throw new BadRequestException(`Платёж уже ${STATUS_RU[payment.status]}`);
    }
    payment.status = "invoiced";
    payment.invoicedAt = new Date();
    payment.externalId = externalId?.trim() || payment.externalId;
    payment.processedBy = adminId;
    await this.paymentsRepo.save(payment);
    return toAdminDTO(payment);
  }

  async markPaid(paymentId: string, adminId: string, note?: string): Promise<AdminPaymentDTO> {
    await this.settle(paymentId, adminId, note);
    return toAdminDTO(await this.findForAdmin(paymentId));
  }

  async cancel(paymentId: string, adminId: string, note?: string): Promise<AdminPaymentDTO> {
    const payment = await this.findForAdmin(paymentId);
    await this.close(payment, "cancelled", adminId, note);
    return toAdminDTO(await this.findForAdmin(paymentId));
  }

  /**
   * Money confirmed: extend the user's access by the plan's days, counted
   * from the end of the current period if one is still running. The row
   * lock makes a double click (or an admin and the poller at once) count
   * once. An admin may also credit an expired payment: Kaspi invoices can
   * be paid after our week runs out.
   */
  async settle(paymentId: string, actorId: string | null, note?: string): Promise<PaymentEntity> {
    const paid = await this.paymentsRepo.manager.transaction(async (mgr) => {
      const payment = await mgr.getRepository(PaymentEntity).findOne({
        where: { id: paymentId },
        lock: { mode: "pessimistic_write" },
      });
      if (!payment) throw new NotFoundException("Платёж не найден");
      const payable = actorId ? [...OPEN_PAYMENT_STATUSES, "expired"] : OPEN_PAYMENT_STATUSES;
      if (!payable.includes(payment.status)) {
        throw new BadRequestException(`Платёж уже ${STATUS_RU[payment.status]}`);
      }
      const user = await mgr.getRepository(UserEntity).findOne({
        where: { id: payment.userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!user) throw new NotFoundException("Пользователь не найден");

      const now = Date.now();
      const current = user.searchPaidUntil ? new Date(user.searchPaidUntil).getTime() : 0;
      const until = new Date(Math.max(now, current) + payment.days * DAY_MS);

      await mgr.getRepository(UserEntity).update(user.id, { searchPaidUntil: until });
      payment.status = "paid";
      payment.paidAt = new Date(now);
      payment.accessUntil = until;
      payment.processedBy = actorId;
      payment.adminNote = note?.trim().slice(0, 500) || payment.adminNote;
      await mgr.getRepository(PaymentEntity).save(payment);
      return { payment, chatId: user.telegramChatId };
    });

    if (paid.chatId) {
      await this.telegram.sendMessage(
        paid.chatId,
        `✅ Оплата ${formatTenge(paid.payment.amount)} получена.\n` +
          `Поиск квартир на DreamApt открыт до ${formatDay(paid.payment.accessUntil!)}.`,
      );
    }
    this.logger.log(`Payment ${paymentId} paid; access until ${paid.payment.accessUntil!.toISOString()}`);
    return paid.payment;
  }

  /** Close open payments nobody paid. */
  @Cron("20 * * * *")
  async expireStale(now = new Date()): Promise<number> {
    const result = await this.paymentsRepo.update(
      { status: In(OPEN_PAYMENT_STATUSES), createdAt: LessThan(new Date(now.getTime() - OPEN_PAYMENT_TTL_DAYS * DAY_MS)) },
      { status: "expired", closedAt: now },
    );
    return result.affected ?? 0;
  }

  /** Providers that can see an invoice's fate settle it on their own. */
  @Cron("*/2 * * * *")
  async syncWithProvider(): Promise<void> {
    if (!this.provider.checkStatus) return;
    const open = await this.paymentsRepo.find({
      where: { provider: this.provider.id, status: "invoiced" },
      take: 50,
    });
    for (const payment of open) {
      try {
        const status = await this.provider.checkStatus(payment);
        if (status === "paid") await this.settle(payment.id, null);
        else if (status) await this.close(payment, status, null);
      } catch (err) {
        this.logger.warn(`Status check for payment ${payment.id} failed: ${err}`);
      }
    }
  }

  private async close(
    payment: PaymentEntity,
    status: "cancelled" | "expired",
    actorId: string | null,
    note?: string,
  ): Promise<PaymentEntity> {
    if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Платёж уже ${STATUS_RU[payment.status]}`);
    }
    payment.status = status;
    payment.closedAt = new Date();
    payment.processedBy = actorId;
    payment.adminNote = note?.trim().slice(0, 500) || payment.adminNote;
    return this.paymentsRepo.save(payment);
  }

  private async findForAdmin(id: string): Promise<PaymentEntity> {
    const payment = await this.paymentsRepo.findOne({ where: { id }, relations: ["user"] });
    if (!payment) throw new NotFoundException("Платёж не найден");
    return payment;
  }
}
