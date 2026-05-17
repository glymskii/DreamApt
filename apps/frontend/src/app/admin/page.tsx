"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { api, ApiUnauthorizedError } from "@/lib/api-client";
import { formatStoredPhone } from "@/lib/phone";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Phone,
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  Clock,
  Shield,
  BarChart3,
} from "lucide-react";

interface Lead {
  id: string;
  phone: string;
  status: "pending" | "approved" | "completed" | "rejected";
  token: string | null;
  tokenExpiresAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Ожидает",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  approved: {
    label: "Одобрено",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  completed: {
    label: "Зарегистрирован",
    className:
      "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  rejected: {
    label: "Отклонено",
    className:
      "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const { user, isAdmin, isLoading } = useAuth();
  const authDialog = useAuthDialog();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["admin-leads"],
    queryFn: () => api.get<{ leads: Lead[] }>("/admin/leads"),
    enabled: isAdmin,
    select: (d) => d.leads,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/leads/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-leads"] }),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/admin/leads/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-leads"] }),
  });

  const buildRegisterLink = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/register/${token}`
      : `/auth/register/${token}`;

  const copyLink = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(buildRegisterLink(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  // ── access guards ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <main className="container mx-auto px-4 py-12 max-w-md text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            Раздел доступен только администратору.
          </p>
          <Button onClick={() => authDialog.open("login")}>Войти</Button>
        </main>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface">
        <Header />
        <main className="container mx-auto px-4 py-12 max-w-md text-center space-y-4">
          <Shield className="h-10 w-10 mx-auto text-destructive" />
          <p className="font-medium">Недостаточно прав</p>
          <p className="text-sm text-muted-foreground">
            Этот раздел доступен только администратору.
          </p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            На главную
          </Button>
        </main>
      </div>
    );
  }

  const leads = leadsQuery.data || [];
  const counts = leads.reduce(
    (acc, l) => ({ ...acc, [l.status]: (acc[l.status] || 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">Заявки на регистрацию</h1>
            <p className="text-xs text-muted-foreground">
              {leads.length} всего · {counts.pending || 0} ожидают одобрения
            </p>
          </div>
          <Link href="/admin/stats">
            <Button variant="outline" size="sm" className="h-8">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Мониторинг</span>
            </Button>
          </Link>
          <Link href="/admin/genplan-align">
            <Button variant="outline" size="sm" className="h-8">
              <span className="hidden sm:inline">Калибровка карты</span>
              <span className="sm:hidden">Карта</span>
            </Button>
          </Link>
        </div>

        {leadsQuery.isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : leadsQuery.error ? (
          <div className="text-center py-12 text-sm text-destructive">
            Не удалось загрузить заявки
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <Phone className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Заявок пока нет
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => {
              const statusInfo = STATUS_LABELS[lead.status] || STATUS_LABELS.pending;
              return (
                <div
                  key={lead.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate font-mono">
                        {formatStoredPhone(lead.phone)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] py-0 ${statusInfo.className} border-transparent`}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <Clock className="h-3 w-3" />
                      {new Date(lead.createdAt).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {lead.approvedAt &&
                        ` · одобрено ${new Date(lead.approvedAt).toLocaleDateString("ru-RU")}`}
                      {lead.completedAt &&
                        ` · регистрация ${new Date(lead.completedAt).toLocaleDateString("ru-RU")}`}
                    </p>
                    {lead.status === "approved" && lead.token && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-[10px] bg-muted px-2 py-1 rounded truncate flex-1 font-mono">
                          {buildRegisterLink(lead.token)}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] shrink-0"
                          onClick={() => copyLink(lead.id, lead.token!)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          {copiedId === lead.id ? "Скопировано!" : "Копировать"}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {lead.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reject.mutate(lead.id)}
                          disabled={reject.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Отклонить
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approve.mutate(lead.id)}
                          disabled={approve.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Одобрить
                        </Button>
                      </>
                    )}
                    {lead.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approve.mutate(lead.id)}
                        disabled={approve.isPending}
                      >
                        Одобрить всё-таки
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
