"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Lock } from "lucide-react";
import { ShutovPaywallModal } from "@/components/access/ShutovPaywallModal";

/** Why the rating is hidden, as the server says: a guest has to sign in,
 *  a user to subscribe. */
export type ShutovLockReason = "login" | "subscribe";

/**
 * In place of Тихон Шутов's rating of a ЖК for someone who doesn't see
 * it: says the rating exists and opens the sign-in / Kaspi subscription.
 */
export function ShutovLockedCard({ name, reason }: { name?: string; reason?: ShutovLockReason }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hint =
    reason === "subscribe"
      ? name
        ? t("complex.shutovSubscribeHint", { name })
        : t("complex.shutovSubscribeEvaluatedHint")
      : name
        ? t("complex.shutovLockedHint", { name })
        : t("complex.shutovEvaluatedHint");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 p-3 rounded-lg border w-full text-left bg-card hover:bg-muted/50 transition-colors"
        style={{ borderLeftWidth: 4, borderLeftColor: "#94a3b8" }}
      >
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{t("complex.shutovExpertTitle")}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      <ShutovPaywallModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
