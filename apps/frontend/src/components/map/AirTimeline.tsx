"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Slider from "@radix-ui/react-slider";
import { Pause, Play, Wind } from "lucide-react";
import type { AirDailyProfile } from "@/hooks/useComplexes";
import { classifyPm25 } from "@/lib/pm25";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const TICKS = [0, 6, 12, 18, 23];
/** Playhead width, px. The slider overhangs the bars by half of it: Radix
 *  keeps the thumb inside the track, and this lands it on bar centres. */
const THUMB = 16;
const STEP_MS = 1000;

export const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** The hour on Almaty's clock, whatever the visitor's own timezone. */
export function almatyHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(now),
  );
}

/**
 * Time-of-day view of the air layer: 24 bars of the city's typical PM 2.5
 * with a playhead. Moving it switches the map from live readings to what
 * each sensor usually shows at that hour; «Сейчас» switches back.
 */
export function AirTimeline({ profile, loading, hour, onHourChange, liveCount, liveAvg, className = "" }: {
  profile?: AirDailyProfile;
  loading: boolean;
  /** Selected Almaty hour; null shows live readings. */
  hour: number | null;
  onHourChange: (hour: number | null) => void;
  liveCount: number;
  liveAvg: number | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const nowHour = almatyHour();
  const shown = hour ?? nowHour;
  const hours = profile?.hours ?? [];
  const hasHistory = (profile?.stations.length ?? 0) > 0;
  const max = Math.max(1, ...hours.map((h) => h.avgPm25 ?? 0));
  const selected = hours[shown];
  const value = hour === null ? liveAvg : selected?.avgPm25 ?? null;

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => onHourChange((shown + 1) % 24), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, shown, onHourChange]);

  const caption = hour === null
    ? t("airTimeline.liveCaption", { count: liveCount })
    : loading
      ? t("airTimeline.loading")
      : !hasHistory
        ? t("airTimeline.empty")
        : selected && selected.stations > 0
          ? t("airTimeline.hourCaption", { count: selected.stations, days: profile?.daysCovered ?? 0 })
          : t("airTimeline.noData");

  return (
    <section aria-label={t("airTimeline.title")}
      className={`rounded-xl border bg-card/95 px-3 py-2 text-card-foreground shadow-lg backdrop-blur ${className}`}>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!hasHistory}
          onClick={() => {
            if (!playing && hour === null) onHourChange(nowHour);
            setPlaying(!playing);
          }}
          aria-label={t(playing ? "airTimeline.pause" : "airTimeline.play")}
          title={t(playing ? "airTimeline.pause" : "airTimeline.play")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border hover:bg-muted disabled:opacity-50">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Wind className="h-4 w-4 shrink-0 text-feature-air" aria-hidden="true" />
            <span className="truncate">
              {hour === null ? t("airTimeline.liveTitle") : t("airTimeline.typicalAt", { time: formatHour(hour) })}
            </span>
            {value !== null && (
              <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: classifyPm25(value).color }} />
                {Math.round(value)}
                <span className="text-xs font-normal text-muted-foreground">{t("airHistory.unit")}</span>
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{caption}</p>
        </div>
        <button type="button" aria-pressed={hour === null}
          onClick={() => {
            setPlaying(false);
            onHourChange(null);
          }}
          className={`h-10 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors ${
            hour === null ? "border-feature-air bg-feature-air text-background" : "hover:bg-muted"
          }`}>
          {t("airTimeline.now")}
        </button>
      </div>

      <div className="relative mt-2 h-9">
        <div className="absolute inset-0 flex items-end gap-px" aria-hidden="true">
          {HOURS.map((h) => {
            const avg = hours[h]?.avgPm25 ?? null;
            return (
              <span key={h}
                className={`flex-1 rounded-t-sm transition-opacity ${h === shown ? "opacity-100" : "opacity-40"}`}
                style={{
                  height: avg === null ? "10%" : `${Math.max(15, (avg / max) * 100)}%`,
                  backgroundColor: avg === null ? "hsl(var(--muted-foreground) / 0.5)" : classifyPm25(avg).color,
                }} />
            );
          })}
        </div>
        <Slider.Root min={0} max={23} step={1} value={[shown]} disabled={!hasHistory}
          onValueChange={([next]) => {
            setPlaying(false);
            onHourChange(next);
          }}
          className="absolute inset-y-0 flex touch-none select-none items-center"
          style={{ left: `calc(100% / 48 - ${THUMB / 2}px)`, right: `calc(100% / 48 - ${THUMB / 2}px)` }}>
          <Slider.Track className="relative h-full grow" />
          <Slider.Thumb aria-label={t("airTimeline.hour")} aria-valuetext={formatHour(shown)}
            className="group relative block h-11 cursor-grab focus-visible:outline-none" style={{ width: THUMB }}>
            <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
            <span className="absolute -bottom-0.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-foreground bg-card group-focus-visible:ring-2 group-focus-visible:ring-ring" />
          </Slider.Thumb>
        </Slider.Root>
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
        {TICKS.map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h + 0.5) / 24) * 100}%` }}>
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>
    </section>
  );
}
