"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { X, Lock, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { ShutovSubscription } from "@/components/access/ShutovSubscription";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Тихон Шутов's ratings of ЖК open after sign-in and the Kaspi
 * subscription. States:
 *   - Guest → sign in through Telegram
 *   - Phone not verified → verify it (Kaspi bills that number)
 *   - Otherwise → the subscription: plan, Kaspi invoice, access period
 */
export function ShutovPaywallModal({ open, onClose: close }: Props) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { open: openAuth } = useAuthDialog();
  const queryClient = useQueryClient();
  const isPhoneVerified = !!user?.phoneVerified;

  // Reopening: pick up a payment the admin confirmed meanwhile.
  useEffect(() => {
    if (open) refreshUser();
  }, [open, refreshUser]);

  // Closing: the ratings come again, unlocked once the payment went through.
  const onClose = () => {
    queryClient.invalidateQueries({ queryKey: ["complex-shutov"] });
    queryClient.invalidateQueries({ queryKey: ["shutov-rating"] });
    close();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shutov-paywall-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-400">
            <Lock size={18} />
          </div>
          <div>
            <h2 id="shutov-paywall-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t("access.shutovTitle")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t("access.shutovIntro")}
            </p>
          </div>
        </div>

        {!user && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("access.needLogin")}
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onClose();
                openAuth("otp", t("auth.shutovGate"));
              }}
            >
              {t("access.loginButton")}
            </Button>
          </div>
        )}

        {user && !isPhoneVerified && (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <ShieldQuestion size={16} className="shrink-0 mt-0.5" />
              <span>{t("access.needPhoneVerify")}</span>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onClose();
                openAuth("otp");
              }}
            >
              {t("access.verifyButton")}
            </Button>
          </div>
        )}

        {user && isPhoneVerified && <ShutovSubscription onStart={onClose} />}
      </div>
    </div>
  );
}
