"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Building2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { formatStoredPhone } from "@/lib/phone";

export default function RegisterCompletePage() {
  const params = useParams();
  const router = useRouter();
  const { checkRegisterToken, completeRegistration } = useAuth();
  const token = String(params.token || "");

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await checkRegisterToken(token);
        if (cancelled) return;
        setValid(res.valid);
        setPhone(res.phone);
      } catch {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, checkRegisterToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    try {
      await completeRegistration(token, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Не удалось завершить регистрацию");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Завершение регистрации</CardTitle>
          <CardDescription>
            Установите пароль для входа в DreamApt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verifying ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !valid ? (
            <div className="text-center py-6 space-y-3">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
              <div>
                <p className="font-medium">Ссылка недействительна</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Возможно, она уже использована, отозвана или истёк срок
                  действия (7 дней). Свяжитесь с администратором.
                </p>
              </div>
              <Button variant="outline" onClick={() => router.push("/dashboard")}>
                На главную
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate font-mono">{formatStoredPhone(phone)}</span>
                <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto shrink-0" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="password">
                  Новый пароль
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-muted-foreground">
                  Минимум 8 символов
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="confirm">
                  Повторите пароль
                </label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Создать аккаунт
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
