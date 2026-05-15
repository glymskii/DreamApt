"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api-client";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity, AlertTriangle, Users, BarChart3 } from "lucide-react";

type Range = { label: string; hours: number; bucket: "hour" | "day" };
const RANGES: Range[] = [
  { label: "24ч", hours: 24, bucket: "hour" },
  { label: "7д", hours: 24 * 7, bucket: "day" },
  { label: "30д", hours: 24 * 30, bucket: "day" },
];

interface OverviewData {
  hours: number;
  total: number;
  errors: number;
  errorRate: number;
  uniquePaths: number;
  byUserType: { guest: number; user: number; admin: number };
}
interface PathRow {
  path: string;
  method: string;
  count: string | number;
  errors: string | number;
}
interface StatusRow {
  statusCode: number;
  count: string | number;
}
interface TimelineRow {
  bucket: string;
  count: string | number;
  errors: string | number;
}

export default function AdminStatsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [range, setRange] = useState<Range>(RANGES[0]);

  // Admin gate — same pattern as /admin/page.tsx
  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const overview = useQuery({
    queryKey: ["stats", "overview", range.hours],
    queryFn: () => api.get<OverviewData>(`/admin/stats/overview?hours=${range.hours}`),
    enabled: !!user && user.role === "admin",
    refetchInterval: 60_000, // live-ish
  });

  const topPaths = useQuery({
    queryKey: ["stats", "byPath", range.hours],
    queryFn: () => api.get<PathRow[]>(`/admin/stats/by-path?hours=${range.hours}&limit=25`),
    enabled: !!user && user.role === "admin",
    refetchInterval: 60_000,
  });

  const byStatus = useQuery({
    queryKey: ["stats", "byStatus", range.hours],
    queryFn: () => api.get<StatusRow[]>(`/admin/stats/by-status?hours=${range.hours}`),
    enabled: !!user && user.role === "admin",
    refetchInterval: 60_000,
  });

  const timeline = useQuery({
    queryKey: ["stats", "timeline", range.hours, range.bucket],
    queryFn: () =>
      api.get<TimelineRow[]>(
        `/admin/stats/timeline?hours=${range.hours}&bucket=${range.bucket}`,
      ),
    enabled: !!user && user.role === "admin",
    refetchInterval: 60_000,
  });

  if (isLoading || !user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto p-4 max-w-6xl space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="h-8">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Назад
              </Button>
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Трафик и мониторинг
            </h1>
          </div>
          <div className="flex gap-1 p-1 bg-muted rounded-md text-sm">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded transition-colors ${
                  range.hours === r.hours
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI
            icon={<Activity className="h-4 w-4" />}
            label="Всего запросов"
            value={overview.data?.total ?? "—"}
          />
          <KPI
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Ошибки (4xx/5xx)"
            value={overview.data?.errors ?? "—"}
            sub={
              overview.data
                ? `${(overview.data.errorRate * 100).toFixed(1)}% от всех`
                : ""
            }
            accent={overview.data && overview.data.errorRate > 0.05 ? "warn" : undefined}
          />
          <KPI
            icon={<BarChart3 className="h-4 w-4" />}
            label="Уникальных путей"
            value={overview.data?.uniquePaths ?? "—"}
          />
          <KPI
            icon={<Users className="h-4 w-4" />}
            label="Гости / Юзеры"
            value={
              overview.data
                ? `${overview.data.byUserType.guest} / ${overview.data.byUserType.user}`
                : "—"
            }
            sub={
              overview.data && overview.data.byUserType.admin > 0
                ? `+ ${overview.data.byUserType.admin} admin`
                : ""
            }
          />
        </div>

        {/* Timeline bar chart */}
        <Card title="Запросы по времени">
          <Timeline rows={timeline.data || []} />
        </Card>

        {/* Two-column grid */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Топ путей">
            <PathsTable rows={topPaths.data || []} />
          </Card>
          <Card title="Распределение по статусам">
            <StatusTable rows={byStatus.data || []} />
          </Card>
        </div>
      </main>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: "warn";
}) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`text-2xl font-bold mt-1 ${
          accent === "warn" ? "text-orange-600 dark:text-orange-400" : ""
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** Bar chart via div widths — keeps bundle small (no recharts). */
function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Нет данных</p>;
  }
  const max = rows.reduce((m, r) => Math.max(m, Number(r.count) || 0), 1);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const total = Number(r.count) || 0;
        const errors = Number(r.errors) || 0;
        const okWidth = ((total - errors) / max) * 100;
        const errWidth = (errors / max) * 100;
        const date = new Date(r.bucket);
        const label = date.toLocaleString("ru-RU", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-28 shrink-0 tabular-nums">{label}</span>
            <div className="flex-1 h-4 flex">
              <div
                className="bg-blue-500 dark:bg-blue-400"
                style={{ width: `${okWidth}%` }}
                title={`${total - errors} OK`}
              />
              <div
                className="bg-orange-500 dark:bg-orange-400"
                style={{ width: `${errWidth}%` }}
                title={`${errors} errors`}
              />
            </div>
            <span className="font-mono w-12 text-right tabular-nums">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

function PathsTable({ rows }: { rows: PathRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Нет данных</p>;
  }
  const max = rows.reduce((m, r) => Math.max(m, Number(r.count) || 0), 1);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const total = Number(r.count) || 0;
        const errors = Number(r.errors) || 0;
        const okPct = ((total - errors) / max) * 100;
        const errPct = (errors / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-12 shrink-0 text-muted-foreground font-mono uppercase">{r.method}</span>
            <span className="flex-1 truncate font-mono text-[11px]" title={r.path}>
              {r.path}
            </span>
            <div className="w-32 h-3 flex bg-muted/30 rounded overflow-hidden">
              <div className="bg-blue-500 dark:bg-blue-400" style={{ width: `${okPct}%` }} />
              <div className="bg-orange-500 dark:bg-orange-400" style={{ width: `${errPct}%` }} />
            </div>
            <span className="font-mono w-12 text-right tabular-nums">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusTable({ rows }: { rows: StatusRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Нет данных</p>;
  }
  const total = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const max = rows.reduce((m, r) => Math.max(m, Number(r.count) || 0), 1);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const n = Number(r.count) || 0;
        const code = r.statusCode;
        const color =
          code >= 500 ? "bg-red-600" :
          code >= 400 ? "bg-orange-500" :
          code >= 300 ? "bg-yellow-500" :
          "bg-blue-500";
        const pct = (n / max) * 100;
        const share = total > 0 ? (n / total) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="font-mono w-10 shrink-0">{code}</span>
            <span className="text-muted-foreground w-32 truncate">{statusLabel(code)}</span>
            <div className="flex-1 h-3 bg-muted/30 rounded overflow-hidden">
              <div className={color} style={{ width: `${pct}%`, height: "100%" }} />
            </div>
            <span className="font-mono w-16 text-right tabular-nums">
              {n} <span className="text-muted-foreground">({share.toFixed(1)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(code: number): string {
  if (code === 200) return "OK";
  if (code === 201) return "Created";
  if (code === 204) return "No content";
  if (code === 301 || code === 302) return "Redirect";
  if (code === 304) return "Not modified";
  if (code === 400) return "Bad request";
  if (code === 401) return "Unauthorized";
  if (code === 403) return "Forbidden";
  if (code === 404) return "Not found";
  if (code === 409) return "Conflict";
  if (code === 429) return "Throttled";
  if (code >= 500) return "Server error";
  return "";
}
