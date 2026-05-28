"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { api } from "@/lib/api-client";
import { formatStoredPhone } from "@/lib/phone";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useAdminUsers,
  useUpdateUserFlags,
  type UsersFilter,
} from "@/hooks/useAdminUsers";
import {
  useAdminAccessRequests,
  useApproveAccessRequest,
  useRejectAccessRequest,
  type AccessRequestStatus,
  type AccessRequestType,
} from "@/hooks/useAccessRequests";
import {
  useProblematicList,
  useSyncAkimatList,
  useAddProblematicManual,
  useUnflagProblematic,
  type SyncReport,
} from "@/hooks/useProblematicComplexes";
import { useAdminComments } from "@/hooks/useAdminComments";
import {
  ArrowLeft, Phone, CheckCircle2, XCircle, Copy, Loader2, Clock,
  Shield, BarChart3, Users, KeyRound, MessageCircle, Search,
  ChevronLeft, ChevronRight, AlertTriangle, Plus, Trash2, RefreshCcw,
  ExternalLink, Heart, MessageSquare,
} from "lucide-react";

// ── Legacy (password-flow) leads ────────────────────────────────────

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

const LEAD_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Ожидает", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Одобрено", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  completed: { label: "Зарегистрирован", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  rejected: { label: "Отклонено", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

// ──────────────────────────────────────────────────────────────────────

type Tab = "users" | "requests" | "problematic" | "comments" | "leads";

export default function AdminPage() {
  const router = useRouter();
  const { user, isAdmin, isLoading } = useAuth();
  const authDialog = useAuthDialog();
  const [tab, setTab] = useState<Tab>("users");

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
          <p className="text-muted-foreground">Раздел доступен только администратору.</p>
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
          <Button variant="outline" onClick={() => router.push("/dashboard")}>На главную</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard")}
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold flex-1">Админ-панель</h1>
          <Link href="/admin/stats">
            <Button variant="outline" size="sm" className="h-8">
              <BarChart3 className="h-4 w-4 sm:mr-1.5" />
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

        <div className="flex gap-1 mb-4 border-b">
          <TabButton active={tab === "users"} onClick={() => setTab("users")} icon={<Users className="h-3.5 w-3.5" />}>
            Пользователи
          </TabButton>
          <TabButton active={tab === "requests"} onClick={() => setTab("requests")} icon={<KeyRound className="h-3.5 w-3.5" />}>
            Запросы доступа
          </TabButton>
          <TabButton active={tab === "problematic"} onClick={() => setTab("problematic")} icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            Проблемные ЖК
          </TabButton>
          <TabButton active={tab === "comments"} onClick={() => setTab("comments")} icon={<MessageSquare className="h-3.5 w-3.5" />}>
            Комментарии
          </TabButton>
          <TabButton active={tab === "leads"} onClick={() => setTab("leads")} icon={<MessageCircle className="h-3.5 w-3.5" />}>
            Регистрация (legacy)
          </TabButton>
        </div>

        {tab === "users" && <UsersTab />}
        {tab === "requests" && <AccessRequestsTab />}
        {tab === "problematic" && <ProblematicTab />}
        {tab === "comments" && <CommentsActivityTab />}
        {tab === "leads" && <LeadsTab />}
      </main>
    </div>
  );
}

function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? "border-amber-500 text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Tab 1: Users ──────────────────────────────────────────────────────

function UsersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UsersFilter>("all");
  const { data, isLoading, error } = useAdminUsers({ page, search, filter });
  const update = useUpdateUserFlags();

  const filterButtons: { value: UsersFilter; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "verified", label: "С подтверждённым номером" },
    { value: "search", label: "С доступом к поиску" },
    { value: "expert", label: "С доступом к экспертам" },
    { value: "admin", label: "Админы" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Всего" value={data.stats.total} />
          <StatCard label="Подтв. номер" value={data.stats.verified} />
          <StatCard label="Поиск" value={data.stats.searchEnabled} />
          <StatCard label="Эксперты" value={data.stats.expertEnabled} />
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Поиск по телефону или имени…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {filterButtons.map((b) => (
            <button
              key={b.value}
              onClick={() => {
                setFilter(b.value);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 rounded text-xs whitespace-nowrap border ${
                filter === b.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-center py-12 text-sm text-destructive">
          Не удалось загрузить пользователей
        </p>
      ) : !data || data.users.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">
          Пользователи не найдены
        </p>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-2 font-medium text-xs">Пользователь</th>
                  <th className="text-left p-2 font-medium text-xs">Телефон</th>
                  <th className="text-left p-2 font-medium text-xs">Статус</th>
                  <th className="text-center p-2 font-medium text-xs">Поиск</th>
                  <th className="text-center p-2 font-medium text-xs">Эксперт</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2">
                      <div className="font-medium text-sm">{u.displayName || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{u.username}</div>
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {u.phone ? formatStoredPhone(u.phone) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {u.role === "admin" && (
                          <Badge className="text-[10px] py-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-transparent">
                            admin
                          </Badge>
                        )}
                        {u.phoneVerified && (
                          <Badge variant="outline" className="text-[10px] py-0 text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800">
                            ✓ номер
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <Toggle
                        checked={u.searchEnabled}
                        disabled={u.role === "admin" || update.isPending}
                        onChange={(v) => update.mutate({ id: u.id, patch: { searchEnabled: v } })}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Toggle
                        checked={u.expertEnabled}
                        disabled={u.role === "admin" || update.isPending}
                        onChange={(v) => update.mutate({ id: u.id, patch: { expertEnabled: v } })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Toggle({
  checked, disabled, onChange,
}: {
  checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Tab 2: Access requests ────────────────────────────────────────────

function AccessRequestsTab() {
  const [status, setStatus] = useState<AccessRequestStatus | "all">("pending");
  const [type, setType] = useState<AccessRequestType | "all">("all");
  const { data, isLoading } = useAdminAccessRequests({ status, type });
  const approve = useApproveAccessRequest();
  const reject = useRejectAccessRequest();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1.5 rounded border whitespace-nowrap ${
                status === s
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              {s === "pending" && "Ожидают"}
              {s === "approved" && "Одобренные"}
              {s === "rejected" && "Отклонённые"}
              {s === "all" && "Все"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["all", "search", "expert"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2.5 py-1.5 rounded border whitespace-nowrap ${
                type === t
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              {t === "all" && "Все типы"}
              {t === "search" && "Поиск"}
              {t === "expert" && "Эксперты"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">
          Запросов нет
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((r) => (
            <div
              key={r.id}
              className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${
                      r.type === "search"
                        ? "text-blue-700 border-blue-300 dark:text-blue-300 dark:border-blue-800"
                        : "text-purple-700 border-purple-300 dark:text-purple-300 dark:border-purple-800"
                    }`}
                  >
                    {r.type === "search" ? "Поиск" : "Эксперт"}
                  </Badge>
                  <span className="text-sm font-medium">{r.user.displayName}</span>
                  {r.user.phone && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatStoredPhone(r.user.phone)}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${
                      r.status === "pending"
                        ? "text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-800"
                        : r.status === "approved"
                          ? "text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800"
                          : "text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-800"
                    }`}
                  >
                    {r.status === "pending" && "Ожидает"}
                    {r.status === "approved" && "Одобрено"}
                    {r.status === "rejected" && "Отклонено"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {new Date(r.createdAt).toLocaleString("ru-RU", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                {r.message && (
                  <p className="mt-2 text-xs text-foreground/80 bg-muted/40 rounded p-2 whitespace-pre-wrap">
                    {r.message}
                  </p>
                )}
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject.mutate({ id: r.id })}
                    disabled={reject.isPending}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Отклонить
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approve.mutate({ id: r.id })}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Одобрить
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Problematic complexes (akimat blacklist) ───────────────────

function ProblematicTab() {
  const { data, isLoading } = useProblematicList();
  const sync = useSyncAkimatList();
  const addManual = useAddProblematicManual();
  const unflag = useUnflagProblematic();
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    district: "",
    address: "",
    reason: "",
    sourceUrl: "",
  });
  const [addError, setAddError] = useState("");

  const runSync = async () => {
    setLastReport(null);
    try {
      const report = await sync.mutateAsync();
      setLastReport(report);
    } catch (err: any) {
      alert(err?.message || "Не удалось синхронизировать список");
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!form.name.trim()) {
      setAddError("Название обязательно");
      return;
    }
    try {
      await addManual.mutateAsync({
        name: form.name.trim(),
        district: form.district.trim() || undefined,
        address: form.address.trim() || undefined,
        reason: form.reason.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
      });
      setForm({ name: "", district: "", address: "", reason: "", sourceUrl: "" });
      setShowAddForm(false);
    } catch (err: any) {
      setAddError(err?.message || "Не удалось добавить");
    }
  };

  const handleUnflag = (id: string, isStub: boolean) => {
    const msg = isStub
      ? "Удалить эту запись? Она была создана автоматически — будет удалена полностью."
      : "Открепить флаг «проблемный» с этого ЖК?";
    if (!confirm(msg)) return;
    unflag.mutate(id);
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Список акимата от 12.07.2025</p>
          <p className="text-[11px] text-muted-foreground">
            28 объектов из пресс-релиза УГАСК. Импорт идемпотентен — повторный
            запуск только обновит метаданные, дубли не создаст.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Добавить вручную
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={runSync}
            disabled={sync.isPending}
          >
            {sync.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
            )}
            Импортировать из акимата
          </Button>
        </div>
      </div>

      {/* Sync report */}
      {lastReport && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium">
            Импорт завершён · {lastReport.total} объектов
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>✓ {lastReport.matched} помечено</span>
            <span>↻ {lastReport.alreadyFlagged} уже были</span>
            <span>+ {lastReport.stubsCreated} карточек-заглушек создано</span>
            {lastReport.failures.length > 0 && (
              <span className="text-rose-600">✕ {lastReport.failures.length} ошибок</span>
            )}
          </div>
          {lastReport.failures.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer">Показать ошибки</summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {lastReport.failures.map((f, i) => (
                  <li key={i}>
                    <span className="font-mono">{f.name}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Manual-add form */}
      {showAddForm && (
        <form
          onSubmit={handleManualAdd}
          className="rounded-lg border bg-card p-3 space-y-2"
        >
          <p className="text-sm font-medium">Добавить вручную</p>
          <Input
            placeholder="Название ЖК (обязательно)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-9 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Район"
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              className="h-9 text-sm"
            />
            <Input
              placeholder="Адрес"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <Input
            placeholder="Причина (опционально)"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="h-9 text-sm"
          />
          <Input
            placeholder="URL источника (опционально)"
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            className="h-9 text-sm"
          />
          {addError && <p className="text-xs text-rose-600">{addError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAddForm(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={addManual.isPending}
            >
              {addManual.isPending && (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">
          Помеченных ЖК нет. Нажмите «Импортировать из акимата» чтобы загрузить
          актуальный список.
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((row) => (
            <div
              key={row.id}
              className="flex flex-col sm:flex-row sm:items-start gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {row.displayName || row.name}
                  </span>
                  {row.isStub && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-800"
                    >
                      stub
                    </Badge>
                  )}
                  {row.district && (
                    <span className="text-[10px] text-muted-foreground">
                      {row.district}
                    </span>
                  )}
                </div>
                {row.problematicSourceName &&
                  row.problematicSourceName !== row.displayName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      В акимате: «{row.problematicSourceName}»
                    </p>
                  )}
                {row.problematicAddress && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {row.problematicAddress}
                  </p>
                )}
                {row.problematicReason && (
                  <p className="mt-2 text-xs text-foreground/80 bg-muted/40 rounded p-2">
                    {row.problematicReason}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  {row.problematicUpdatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(row.problematicUpdatedAt).toLocaleDateString(
                        "ru-RU",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                    </span>
                  )}
                  {row.problematicSourceUrl &&
                    row.problematicSourceUrl !== "manual" && (
                      <a
                        href={row.problematicSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 underline hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        источник
                      </a>
                    )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => handleUnflag(row.id, row.isStub)}
                  disabled={unflag.isPending}
                >
                  {row.isStub ? (
                    <>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Удалить
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Открепить
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Comment activity (site-wide moderation feed) ───────────────

function CommentsActivityTab() {
  const { data, isLoading, error } = useAdminComments(50);

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Всего" value={data.total} />
          <StatCard label="Активных" value={data.active} />
          <StatCard label="Удалённых" value={data.deleted} />
          <StatCard label="Авторов" value={data.authors} />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-center py-12 text-sm text-destructive">
          Не удалось загрузить комментарии
        </p>
      ) : !data || data.recent.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Комментариев пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {data.recent.map((c) => {
            const isDeleted = !!c.deletedAt;
            return (
              <div
                key={c.id}
                className={`p-3 rounded-lg border bg-card ${isDeleted ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-medium">{c.authorName}</span>
                  {c.authorPhone && (
                    <span className="font-mono text-muted-foreground">
                      {formatStoredPhone(c.authorPhone)}
                    </span>
                  )}
                  <span className="text-muted-foreground">→</span>
                  <a
                    href={`/dashboard?complex=${c.complexId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {c.complexName}
                  </a>
                  {c.complexDistrict && (
                    <span className="text-[10px] text-muted-foreground">
                      {c.complexDistrict}
                    </span>
                  )}
                  {isDeleted && (
                    <Badge variant="outline" className="text-[10px] py-0 text-rose-600 border-rose-300">
                      удалён
                    </Badge>
                  )}
                </div>
                <p className={`mt-1.5 text-sm leading-snug ${isDeleted ? "italic text-muted-foreground" : ""}`}>
                  {isDeleted ? "[удалён]" : c.text}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(c.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  {c.likesCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3 fill-current text-red-500" />
                      {c.likesCount}
                    </span>
                  )}
                  {c.editedAt && <span className="italic">изменён</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Legacy leads (password-flow) ───────────────────────────────

function LeadsTab() {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["admin-leads"],
    queryFn: () => api.get<{ leads: Lead[] }>("/admin/leads"),
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

  if (leadsQuery.isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }
  const leads = leadsQuery.data || [];
  if (leads.length === 0) {
    return (
      <p className="text-center py-12 text-sm text-muted-foreground">
        Заявок пока нет
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => {
        const statusInfo = LEAD_STATUS[lead.status] || LEAD_STATUS.pending;
        return (
          <div
            key={lead.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border bg-card"
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
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
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
                  <Button size="sm" variant="outline" onClick={() => reject.mutate(lead.id)} disabled={reject.isPending}>
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Отклонить
                  </Button>
                  <Button size="sm" onClick={() => approve.mutate(lead.id)} disabled={approve.isPending}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Одобрить
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
