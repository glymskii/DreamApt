"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Lock, CheckCircle2, Clock, ShieldQuestion, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import {
  AccessRequestType,
  useMyAccessRequests,
  useSubmitAccessRequest,
} from "@/hooks/useAccessRequests";

interface Props {
  open: boolean;
  onClose: () => void;
  type: AccessRequestType;
}

/**
 * Modal shown when a logged-in but non-approved user tries to use a gated
 * feature (search launch / expert opinions). Three states:
 *   - Not phone-verified → tell them to verify first (open auth dialog)
 *   - No request yet → form to submit a request with optional message
 *   - Pending request exists → "we'll get back to you" with current state
 */
export function RequestAccessModal({ open, onClose, type }: Props) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { open: openAuth } = useAuthDialog();
  const isPhoneVerified = !!user?.phoneVerified;
  const { data: mine, refetch } = useMyAccessRequests(open && isPhoneVerified);
  const submitMut = useSubmitAccessRequest();
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Find an existing request of this type — driver of the UI state.
  const existing = useMemo(() => {
    return mine?.find((r) => r.type === type) || null;
  }, [mine, type]);

  // Reset form when reopening.
  useEffect(() => {
    if (open) {
      setMessage("");
      setSubmitError(null);
      refreshUser();
    }
  }, [open, refreshUser]);

  if (!open) return null;

  const titleKey =
    type === "search" ? "access.searchTitle" : "access.expertTitle";
  const introKey =
    type === "search" ? "access.searchIntro" : "access.expertIntro";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t(titleKey)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t(introKey)}
            </p>
          </div>
        </div>

        {/* State 1: not logged in */}
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
                openAuth("otp");
              }}
            >
              {t("access.loginButton")}
            </Button>
          </div>
        )}

        {/* State 2: logged in but phone not verified */}
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

        {/* State 3: pending or processed */}
        {user && isPhoneVerified && existing && (
          <div className="space-y-3">
            {existing.status === "pending" && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <Clock size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t("access.pendingTitle")}</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {t("access.pendingSub")}
                  </p>
                </div>
              </div>
            )}
            {existing.status === "approved" && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t("access.approvedTitle")}</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {t("access.approvedSub")}
                  </p>
                </div>
              </div>
            )}
            {existing.status === "rejected" && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-800 dark:text-rose-300">
                <p className="font-medium">{t("access.rejectedTitle")}</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {t("access.rejectedSub")}
                </p>
              </div>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        )}

        {/* State 4: ready to submit */}
        {user && isPhoneVerified && !existing && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitError(null);
              try {
                await submitMut.mutateAsync({
                  type,
                  message: message.trim() || undefined,
                });
                await refetch();
              } catch (err: any) {
                setSubmitError(
                  err?.message || t("access.submitFailed"),
                );
              }
            }}
          >
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              {t("access.messageLabel")}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder={t("access.messagePlaceholder")}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </label>
            {submitError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {submitError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={submitMut.isPending}
            >
              {submitMut.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  {t("access.submitting")}
                </>
              ) : (
                t("access.submitButton")
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
