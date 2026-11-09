"use client";

import { AlertTriangle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { ApiError } from "@/lib/api-client";

/**
 * Why a search didn't start: the daily limit (a guest is offered to sign
 * in — accounts get more searches), the server being busy, or anything
 * else the server said.
 */
export function SearchStartError({ error }: { error: unknown }) {
  const authDialog = useAuthDialog();
  if (!error) return null;
  const message =
    error instanceof Error && error.message ? error.message : "Не удалось запустить поиск. Попробуйте ещё раз.";
  const offerSignIn = error instanceof ApiError && error.code === "SEARCH_LIMIT" && !!error.body?.signIn;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200 flex flex-wrap items-start gap-2"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="flex-1 min-w-[12rem]">{message}</p>
      {offerSignIn && (
        <Button size="sm" onClick={() => authDialog.open("otp")}>
          <LogIn className="h-4 w-4 mr-1" />
          Войти через Telegram
        </Button>
      )}
    </div>
  );
}
