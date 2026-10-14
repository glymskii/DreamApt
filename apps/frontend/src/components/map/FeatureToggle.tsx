"use client";

import { useTranslation } from "react-i18next";
import { useId } from "react";
import { Check, Minus } from "lucide-react";
import { mapFeatures, type MapFeature } from "./feature-style";
import { newBuildingSince } from "@/lib/construction";

export function FeatureToggle({ feature, active, onToggle, count, disabled = false }: {
  feature: MapFeature;
  active: boolean;
  onToggle?: () => void;
  count?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const { icon: Icon, label, hint, className } = mapFeatures[feature];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-describedby={hintId}
      disabled={disabled}
      title={t(disabled ? "map.featureUnavailable" : hint, { year: newBuildingSince() })}
      className={`relative min-h-10 sm:min-h-11 min-w-0 rounded-xl border px-2 py-1.5 text-xs transition-colors ${className} ${
        active ? "border-current shadow-sm" : "border-border bg-card hover:bg-muted"
      } disabled:opacity-60`}
      style={active ? { backgroundColor: `rgb(var(--feature-${feature}) / 0.09)` } : undefined}
    >
      {active && <Check aria-hidden="true" className="absolute right-0.5 top-0.5 h-3 w-3 sm:hidden" />}
      <span className="flex items-center justify-center gap-1.5 font-semibold leading-4">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t(label)}</span>
        {count != null && <span className="tabular-nums rounded-md bg-muted px-1 text-foreground">{count}</span>}
      </span>
      <span className="mt-0.5 hidden sm:flex items-center justify-center gap-1 text-[11px] leading-4 text-muted-foreground">
        {active ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        {t(disabled ? "map.featureUnavailable" : active ? "map.featureOn" : "map.featureOff")}
      </span>
      <span id={hintId} className="sr-only">{t(hint, { year: newBuildingSince() })}</span>
    </button>
  );
}
