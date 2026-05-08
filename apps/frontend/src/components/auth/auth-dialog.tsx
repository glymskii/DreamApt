"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ApiUnauthorizedError } from "@/lib/api-client";
import { formatKzPhone, toE164 } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Lock,
  Phone,
  Building2,
  Loader2,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";

type Tab = "login" | "request";

interface AuthDialogContextValue {
  open: (tab?: Tab, message?: string) => void;
  close: () => void;
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function useAuthDialog() {
  const ctx = useContext(AuthDialogContext);
  if (!ctx) throw new Error("useAuthDialog must be used inside AuthDialogProvider");
  return ctx;
}

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("login");
  const [message, setMessage] = useState<string | null>(null);

  const open = useCallback((t: Tab = "login", m?: string) => {
    setTab(t);
    setMessage(m || null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setMessage(null);
  }, []);

  return (
    <AuthDialogContext.Provider value={{ open, close }}>
      {children}
      {isOpen && (
        <AuthDialog
          tab={tab}
          setTab={setTab}
          onClose={close}
          message={message}
        />
      )}
    </AuthDialogContext.Provider>
  );
}

function AuthDialog({
  tab,
  setTab,
  onClose,
  message,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  message: string | null;
}) {
  const { t } = useTranslation();
  const { login, registerRequest } = useAuth();

  // login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // register state
  const [phone, setPhone] = useState("+7 ");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(username, password);
      onClose();
    } catch (err) {
      setLoginError(
        err instanceof ApiUnauthorizedError
          ? t("auth.loginInvalid")
          : t("auth.loginFailed"),
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    const e164 = toE164(phone);
    if (!e164) {
      setRegError(t("auth.phoneInvalid"));
      return;
    }
    setRegLoading(true);
    try {
      await registerRequest(e164);
      setRegSuccess(true);
    } catch (err: any) {
      setRegError(err?.message || t("auth.requestFailed"));
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card text-card-foreground rounded-xl shadow-2xl p-5 sm:p-6 relative border">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted transition-colors"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">{t("auth.title")}</span>
        </div>

        {message && (
          <div className="mt-2 mb-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mt-3 mb-4 text-sm">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
              tab === "login"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.tabLogin")}
          </button>
          <button
            onClick={() => setTab("request")}
            className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
              tab === "request"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.tabRequest")}
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="username">
                {t("auth.loginField")}
              </label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="+7 (777) 123-45-67"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="password">
                {t("auth.loginPassword")}
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {loginError && (
              <p className="text-xs text-destructive">{loginError}</p>
            )}
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              {t("auth.loginSubmit")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("auth.loginNoAccount")}{" "}
              <button
                type="button"
                onClick={() => setTab("request")}
                className="text-primary hover:underline"
              >
                {t("auth.loginRequestLink")}
              </button>
            </p>
          </form>
        ) : regSuccess ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
            <div>
              <p className="font-semibold">{t("auth.requestSuccessTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {t("auth.requestSuccessSub")}
              </p>
            </div>
            <Button variant="outline" onClick={onClose} className="w-full">
              {t("auth.ok")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="text-xs text-muted-foreground mb-2">
              {t("auth.requestIntro")}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="phone">
                {t("auth.phoneField")}
              </label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  className="pl-8 font-mono tracking-wide"
                  value={phone}
                  onChange={(e) => setPhone(formatKzPhone(e.target.value))}
                  onFocus={() => {
                    if (!phone) setPhone("+7 ");
                  }}
                  required
                  autoComplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  maxLength={18}
                />
              </div>
              <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                <MessageCircle className="h-3 w-3 mt-0.5 shrink-0 text-green-600" />
                <span>{t("auth.phoneHint")}</span>
              </div>
            </div>
            {regError && <p className="text-xs text-destructive">{regError}</p>}
            <Button type="submit" className="w-full" disabled={regLoading}>
              {regLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              {t("auth.requestSubmit")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
