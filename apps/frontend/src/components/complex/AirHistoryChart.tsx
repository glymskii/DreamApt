"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, CalendarDays } from "lucide-react";
import type { AirHistoryResponse } from "@/hooks/useComplexes";

/**
 * PM2.5 averages around a ЖК, bucketed by hour of day / weekday.
 *
 * This is the payoff of the append-only air_quality_readings archive: a
 * single live reading says "сейчас 18 µg/m³", this says "здесь стабильно
 * душно к 7 утра" — which is what actually matters when choosing where to
 * live. Rendered as plain CSS bars (no chart lib) to keep the slide-over
 * bundle small.
 *
 * Thresholds/colours mirror AirKazService.classifyPm25 on the backend so
 * the bar colour means the same thing as the live badge above it.
 */

const PM25_COLORS: { max: number; color: string }[] = [
  { max: 35, color: "#22c55e" },
  { max: 55, color: "#eab308" },
  { max: 125, color: "#f97316" },
  { max: 225, color: "#dc2626" },
  { max: 325, color: "#9f1239" },
  { max: Infinity, color: "#7c2d12" },
];

function pm25Color(v: number): string {
  return (PM25_COLORS.find((b) => v < b.max) || PM25_COLORS[PM25_COLORS.length - 1]).color;
}

/** Postgres DOW is 0=Sunday; display Mon-first per local convention. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  data: AirHistoryResponse | undefined;
  isLoading?: boolean;
}

export function AirHistoryChart({ data, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"hour" | "weekday">("hour");

  const loc = data?.location;
  const byHour = loc?.byHour || [];
  const byWeekday = loc?.byWeekday || [];

  // Build a dense 24-slot / 7-slot series so gaps stay visible as gaps
  // instead of silently collapsing the axis.
  const hourSeries = useMemo(() => {
    const map = new Map(byHour.map((b) => [b.hour, b]));
    return Array.from({ length: 24 }, (_, h) => map.get(h) || null);
  }, [byHour]);

  const weekdaySeries = useMemo(() => {
    const map = new Map(byWeekday.map((b) => [b.weekday, b]));
    return WEEKDAY_ORDER.map((d) => ({ weekday: d, bucket: map.get(d) || null }));
  }, [byWeekday]);

  const series = mode === "hour" ? hourSeries : weekdaySeries.map((w) => w.bucket);
  const maxVal = Math.max(1, ...series.filter(Boolean).map((b) => b!.avgPm25));

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-muted rounded w-1/2" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Not enough local history — say so plainly rather than drawing a
  // convincing-looking chart out of a handful of points.
  if (!loc || byHour.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">{t("airHistory.title")}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t("airHistory.notEnough")}
        </p>
      </div>
    );
  }

  const period = formatPeriod(data?.coverage, i18n.language);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {mode === "hour" ? (
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-semibold truncate">
            {t("airHistory.title")}
          </span>
        </div>
        <div className="flex gap-1 text-[10px] shrink-0">
          <button
            onClick={() => setMode("hour")}
            className={`px-2 py-0.5 rounded ${
              mode === "hour"
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("airHistory.byHour")}
          </button>
          <button
            onClick={() => setMode("weekday")}
            className={`px-2 py-0.5 rounded ${
              mode === "weekday"
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("airHistory.byWeekday")}
          </button>
        </div>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-[2px] h-20">
        {mode === "hour"
          ? hourSeries.map((b, h) => (
              <Bar
                key={h}
                value={b?.avgPm25 ?? null}
                samples={b?.samples ?? 0}
                maxVal={maxVal}
                label={`${String(h).padStart(2, "0")}:00`}
                unit={t("airHistory.unit")}
              />
            ))
          : weekdaySeries.map(({ weekday, bucket }) => (
              <Bar
                key={weekday}
                value={bucket?.avgPm25 ?? null}
                samples={bucket?.samples ?? 0}
                maxVal={maxVal}
                label={t(`airHistory.wd${weekday}`)}
                unit={t("airHistory.unit")}
                wide
              />
            ))}
      </div>

      {/* Axis */}
      <div className="flex justify-between text-[9px] text-muted-foreground">
        {mode === "hour" ? (
          <>
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </>
        ) : (
          WEEKDAY_ORDER.map((d) => <span key={d}>{t(`airHistory.wd${d}`)}</span>)
        )}
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground/80">
        {t("airHistory.caption", {
          radius: loc.radiusKm,
          // `count` drives the plural rule, `formatted` carries the
          // thousands separator — i18next interpolates {{count}} raw.
          samples: t("airHistory.samplesCount", {
            count: loc.samples,
            formatted: loc.samples.toLocaleString(
              i18n.language?.startsWith("kk") ? "kk-KZ" : "ru-RU",
            ),
          }),
        })}
        {period ? ` · ${period}` : ""}
      </p>
    </div>
  );
}

function Bar({
  value,
  samples,
  maxVal,
  label,
  unit,
  wide,
}: {
  value: number | null;
  samples: number;
  maxVal: number;
  label: string;
  unit: string;
  wide?: boolean;
}) {
  if (value === null) {
    return (
      <div
        className={`${wide ? "flex-1" : "flex-1"} h-full flex items-end`}
        title={`${label} — —`}
      >
        <div className="w-full rounded-sm bg-muted/40" style={{ height: 2 }} />
      </div>
    );
  }
  const pct = Math.max(4, Math.round((value / maxVal) * 100));
  return (
    <div
      className="flex-1 h-full flex items-end group relative"
      title={`${label} · ${value} ${unit} · n=${samples}`}
    >
      <div
        className="w-full rounded-sm transition-opacity group-hover:opacity-80"
        style={{ height: `${pct}%`, backgroundColor: pm25Color(value) }}
      />
    </div>
  );
}

/** "май – июнь 2026" style period label from the archive coverage. */
function formatPeriod(
  coverage: AirHistoryResponse["coverage"] | undefined,
  lang: string,
): string | null {
  if (!coverage?.firstReading || !coverage?.lastReading) return null;
  const locale = lang?.startsWith("kk") ? "kk-KZ" : "ru-RU";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", year: "numeric" });
  const a = fmt(coverage.firstReading);
  const b = fmt(coverage.lastReading);
  return a === b ? a : `${a} – ${b}`;
}
