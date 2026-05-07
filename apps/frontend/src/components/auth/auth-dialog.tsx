"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ApiUnauthorizedError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Lock, Mail, Building2, Loader2, CheckCircle2 } from "lucide-react";

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
  const { login, registerRequest } = useAuth();

  // login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // register state
  const [email, setEmail] = useState("");
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
          ? "Неверный логин или пароль"
          : "Не удалось войти",
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    setRegLoading(true);
    try {
      await registerRequest(email);
      setRegSuccess(true);
    } catch (err: any) {
      setRegError(err?.message || "Не удалось отправить заявку");
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
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">DreamApt</span>
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
            Вход
          </button>
          <button
            onClick={() => setTab("request")}
            className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
              tab === "request"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Запросить доступ
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="username">
                Логин
              </label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="password">
                Пароль
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
              Войти
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Нет аккаунта?{" "}
              <button
                type="button"
                onClick={() => setTab("request")}
                className="text-primary hover:underline"
              >
                Запросите доступ
              </button>
            </p>
          </form>
        ) : regSuccess ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
            <div>
              <p className="font-semibold">Заявка отправлена!</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Мы рассмотрим её и пришлём вам ссылку для завершения регистрации
                на указанный email.
              </p>
            </div>
            <Button variant="outline" onClick={onClose} className="w-full">
              Понятно
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="text-xs text-muted-foreground mb-2">
              Оставьте email — после одобрения вы получите ссылку для завершения
              регистрации.
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  className="pl-8"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            {regError && <p className="text-xs text-destructive">{regError}</p>}
            <Button type="submit" className="w-full" disabled={regLoading}>
              {regLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Отправить заявку
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
