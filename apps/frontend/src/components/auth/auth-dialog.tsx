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
  ExternalLink,
  ArrowLeft,
} from "lucide-react";

type Tab = "otp" | "password";
// Legacy callers still pass "login" / "request" — accept those too and
// map at the boundary. Saves us touching every site that opens the dialog.
type OpenTab = Tab | "login" | "request";

interface AuthDialogContextValue {
  open: (tab?: OpenTab, message?: string) => void;
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
  const [tab, setTab] = useState<Tab>("otp");
  const [message, setMessage] = useState<string | null>(null);

  const open = useCallback((t: OpenTab = "otp", m?: string) => {
    // Backwards-compat: legacy code calls open("login") / open("request").
    // Map those to the new tab names so nothing breaks while we migrate.
    const mapped: Tab =
      t === "login" ? "password" : t === "request" ? "otp" : t;
    setTab(mapped);
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
  const { login, otpRequest, otpVerify } = useAuth();

  // === Password tab state (admin / legacy users) ===
  const [loginPhone, setLoginPhone] = useState("+7 ");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // === OTP tab state ===
  // Multi-step within one tab: input phone → wait-for-code → done.
  // Keeping state local to AuthDialog so closing the dialog reset everything.
  type OtpStep = "phone" | "code";
  const [otpStep, setOtpStep] = useState<OtpStep>("phone");
  const [otpPhone, setOtpPhone] = useState("+7 ");
  const [otpCode, setOtpCode] = useState("");
  const [otpDeeplink, setOtpDeeplink] = useState<string | null>(null);
  const [otpBotUsername, setOtpBotUsername] = useState<string | null>(null);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const e164 = toE164(loginPhone);
    if (!e164) {
      setLoginError(t("auth.phoneInvalid"));
      return;
    }
    setLoginLoading(true);
    try {
      await login(e164, password);
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

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    const e164 = toE164(otpPhone);
    if (!e164) {
      setOtpError(t("auth.phoneInvalid"));
      return;
    }
    setOtpLoading(true);
    try {
      const res = await otpRequest(e164);
      setOtpDeeplink(res.telegramDeeplink);
      setOtpBotUsername(res.botUsername);
      setOtpStep("code");
    } catch (err: any) {
      setOtpError(err?.message || t("auth.otpRequestFailed"));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    const e164 = toE164(otpPhone);
    if (!e164) return;
    const cleanCode = otpCode.replace(/\D+/g, "");
    if (cleanCode.length !== 6) {
      setOtpError(t("auth.otpCodeLengthError"));
      return;
    }
    setOtpLoading(true);
    try {
      await otpVerify(e164, cleanCode);
      onClose();
    } catch (err: any) {
      setOtpError(err?.message || t("auth.otpVerifyFailed"));
    } finally {
      setOtpLoading(false);
    }
  };

  const otpBack = () => {
    setOtpStep("phone");
    setOtpCode("");
    setOtpError("");
    setOtpDeeplink(null);
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

        {/* Tabs: OTP is the primary path. Password tab kept for admin. */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mt-3 mb-4 text-sm">
          <button
            onClick={() => setTab("otp")}
            className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
              tab === "otp"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.tabOtp")}
          </button>
          <button
            onClick={() => setTab("password")}
            className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
              tab === "password"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.tabPassword")}
          </button>
        </div>

        {tab === "password" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="login-phone">
                {t("auth.loginField")}
              </label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="login-phone"
                  type="tel"
                  inputMode="tel"
                  className="pl-8 font-mono tracking-wide"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(formatKzPhone(e.target.value))}
                  onFocus={() => { if (!loginPhone) setLoginPhone("+7 "); }}
                  required
                  autoComplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  maxLength={18}
                />
              </div>
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
            {loginError && <p className="text-xs text-destructive">{loginError}</p>}
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {t("auth.loginSubmit")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("auth.passwordHintAdmin")}
            </p>
          </form>
        ) : otpStep === "phone" ? (
          <form onSubmit={handleOtpRequest} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("auth.otpIntro")}</p>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="otp-phone">
                {t("auth.phoneField")}
              </label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="otp-phone"
                  type="tel"
                  inputMode="tel"
                  className="pl-8 font-mono tracking-wide"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(formatKzPhone(e.target.value))}
                  onFocus={() => { if (!otpPhone) setOtpPhone("+7 "); }}
                  required
                  autoComplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  maxLength={18}
                />
              </div>
            </div>
            {otpError && <p className="text-xs text-destructive">{otpError}</p>}
            <Button type="submit" className="w-full" disabled={otpLoading}>
              {otpLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {t("auth.otpRequestSubmit")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center leading-snug">
              {t("auth.otpFooterNoTelegram")}
            </p>
          </form>
        ) : (
          <form onSubmit={handleOtpVerify} className="space-y-3">
            {/* Step 2: deeplink to bot + code input */}
            <div className="text-xs text-muted-foreground">
              {t("auth.otpStep2Intro")}{" "}
              {otpBotUsername && (
                <span className="font-mono">@{otpBotUsername}</span>
              )}
            </div>

            {otpDeeplink && (
              <a href={otpDeeplink} target="_blank" rel="noopener noreferrer" className="block">
                <Button type="button" variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4 mr-1.5 text-blue-500" />
                  {t("auth.otpOpenBot")}
                  <ExternalLink className="h-3 w-3 ml-1.5 text-muted-foreground" />
                </Button>
              </a>
            )}

            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="otp-code">
                {t("auth.otpCodeLabel")}
              </label>
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                className="text-center text-2xl font-mono tracking-[0.4em]"
                placeholder="••••••"
                autoFocus
                autoComplete="one-time-code"
              />
            </div>

            {otpError && <p className="text-xs text-destructive">{otpError}</p>}

            <Button type="submit" className="w-full" disabled={otpLoading || otpCode.length !== 6}>
              {otpLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {t("auth.otpVerifySubmit")}
            </Button>

            <button
              type="button"
              onClick={otpBack}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mx-auto"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("auth.otpChangePhone")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
