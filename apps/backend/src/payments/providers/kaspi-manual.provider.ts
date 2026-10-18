import { Injectable, Logger } from "@nestjs/common";
import { TelegramService } from "../../telegram/telegram.service";
import type { PaymentEntity } from "../../database/entities/payment.entity";
import type { UserEntity } from "../../database/entities/user.entity";
import type { PaymentProvider } from "./payment-provider";
import { formatPhone, formatTenge } from "../payment-format";

/**
 * Kaspi Pay without an API: the admin gets a Telegram message with the
 * number and amount, issues a remote invoice in the Kaspi Pay app, and
 * marks the payment in /admin once Kaspi shows it paid.
 */
@Injectable()
export class KaspiManualProvider implements PaymentProvider {
  readonly id = "kaspi_manual";
  private readonly logger = new Logger(KaspiManualProvider.name);

  constructor(private telegram: TelegramService) {}

  async requestPayment(payment: PaymentEntity, _user: UserEntity) {
    const site = (process.env.PUBLIC_SITE_URL || "https://dreamapt.kz").replace(/\/$/, "");
    const sent = await this.telegram.notifyAdmins(
      [
        "💳 Новая оплата DreamApt",
        `Номер Kaspi: ${formatPhone(payment.phone)}`,
        `Сумма: ${formatTenge(payment.amount)} — поиск на ${payment.days} дн.`,
        "",
        "Выставьте счёт в Kaspi Pay → «Удалённая оплата», затем отметьте его в админке:",
        `${site}/admin?tab=payments`,
      ].join("\n"),
    );
    if (sent === 0) this.logger.warn(`Payment ${payment.id}: no admin was notified`);
    return { status: "pending" as const };
  }
}
