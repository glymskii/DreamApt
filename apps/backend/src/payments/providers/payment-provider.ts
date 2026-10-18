import type { PaymentEntity } from "../../database/entities/payment.entity";
import type { UserEntity } from "../../database/entities/user.entity";

/**
 * Who bills the user. PaymentsService owns statuses and access; a provider
 * only asks for the money and, when it can, reports what became of it.
 *
 * Today: KaspiManualProvider — an admin gets a Telegram message and issues
 * the invoice in the Kaspi Pay app by hand. An official Kaspi API (or an
 * aggregator) slots in as another provider without touching the rest.
 */
export interface PaymentProvider {
  /** Stored on each payment, e.g. "kaspi_manual". */
  readonly id: string;

  /** Ask for the money: send an invoice, or hand the job to a person. */
  requestPayment(payment: PaymentEntity, user: UserEntity): Promise<{
    status: "pending" | "invoiced";
    /** The provider's id for the invoice, when it issued one. */
    externalId?: string;
  }>;

  /**
   * The invoice's final state, or null while undecided. Providers that
   * can't tell (manual billing) leave it out and an admin decides.
   */
  checkStatus?(payment: PaymentEntity): Promise<"paid" | "cancelled" | "expired" | null>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
