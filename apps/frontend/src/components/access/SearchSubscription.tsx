"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Clock, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  isOpenPayment,
  useCancelMyPayment,
  useCheckout,
  useMyPayments,
  usePaymentPlans,
} from "@/hooks/usePayments";
import { ApiUnauthorizedError } from "@/lib/api-client";
import { canSearch, formatAccessDay, formatTenge } from "@/lib/access";
import { formatStoredPhone } from "@/lib/phone";

const PERKS = ["perkMatch", "perkScore", "perkUnlimited"] as const;

interface Props {
  /** Offered once access is open: carries on to the search. */
  onStart?: () => void;
}

/**
 * Paid search for a signed-in user with a verified phone: the plan and a
 * Kaspi invoice request, then the invoice's progress, then the access
 * period with an option to renew.
 */
export function SearchSubscription({ onStart }: Props) {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { data: plans, isLoading: plansLoading } = usePaymentPlans();
  const { data: mine } = useMyPayments(!!user);
  const checkout = useCheckout();
  const cancel = useCancelMyPayment();

  const plan = plans?.[0];
  const open = mine?.find(isOpenPayment) ?? null;
  const hasAccess = canSearch(user);
  const paidUntil =
    user?.searchPaidUntil && Date.parse(user.searchPaidUntil) > Date.now()
      ? user.searchPaidUntil
      : null;

  // The admin confirmed a payment while this was open: reload the user so
  // the gate opens without a page refresh.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    const paid = mine?.find((p) => p.status === "paid");
    if (!paid?.accessUntil || refreshedFor.current === paid.id) return;
    const until = Date.parse(paid.accessUntil);
    if (until <= Date.now()) return;
    if (user?.searchPaidUntil && Date.parse(user.searchPaidUntil) >= until) return;
    refreshedFor.current = paid.id;
    refreshUser();
  }, [mine, user?.searchPaidUntil, refreshUser]);

  if (plansLoading) {
    return (
      <div className="py-6 text-center">
        <Loader2 size={20} className="mx-auto animate-spin text-slate-400" />
      </div>
    );
  }

  const error = checkout.error || cancel.error;
  const errorText = !error
    ? null
    : error instanceof ApiUnauthorizedError
      ? t("paywall.payFailed")
      : error.message || t("paywall.payFailed");
  const phone = user?.phone ? formatStoredPhone(user.phone) : "";

  return (
    <div className="space-y-3">
      {hasAccess && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <p className="font-medium">
            {paidUntil
              ? t("paywall.activeTitle", { date: formatAccessDay(paidUntil, i18n.language) })
              : t("paywall.activeUnlimited")}
          </p>
        </div>
      )}

      {open ? (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
          {open.status === "invoiced" ? (
            <Receipt size={16} className="shrink-0 mt-0.5" />
          ) : (
            <Clock size={16} className="shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-medium">
              {t(open.status === "invoiced" ? "paywall.invoicedTitle" : "paywall.pendingTitle", {
                amount: formatTenge(open.amount),
              })}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              {t(open.status === "invoiced" ? "paywall.invoicedSub" : "paywall.pendingSub", {
                phone: formatStoredPhone(open.phone),
              })}
            </p>
          </div>
        </div>
      ) : (
        plan &&
        !hasAccess && (
          <>
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatTenge(plan.amount)}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {t("paywall.period", { count: plan.days })}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {PERKS.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <Check size={16} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    {t(`paywall.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("paywall.invoiceNote", { phone })}
            </p>
          </>
        )
      )}

      {errorText && <p className="text-xs text-rose-600 dark:text-rose-400">{errorText}</p>}

      {hasAccess && onStart && (
        <Button type="button" className="w-full" onClick={onStart}>
          {t("paywall.startButton")}
        </Button>
      )}

      {!open && plan && (!hasAccess || paidUntil) && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant={hasAccess ? "outline" : "default"}
            className="w-full"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate(plan.id)}
          >
            {checkout.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                {t("paywall.paying")}
              </>
            ) : hasAccess ? (
              t("paywall.renewButton", { amount: formatTenge(plan.amount) })
            ) : (
              t("paywall.payButton")
            )}
          </Button>
          {hasAccess && (
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              {t("paywall.renewNote")}
            </p>
          )}
        </div>
      )}

      {open?.status === "pending" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-slate-500"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(open.id)}
        >
          {t("paywall.cancelButton")}
        </Button>
      )}
    </div>
  );
}
