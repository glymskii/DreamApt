"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Search, Activity, Building, AlertTriangle, Construction, House, SlidersHorizontal, RotateCcw, Check } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  completedYear,
  formatCompletion,
  isNewBuilding,
  isUnderConstruction,
  type Stage,
} from "@/lib/construction";
import type { ComplexFilters } from "@/hooks/useComplexFilters";

interface MapSidebarProps {
  // Owned by the page: the map draws the same filtered ЖК.
  filters: ComplexFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  isMobile?: boolean;
}

// District values are stored in Russian by the data layer; keep raw strings.
const DISTRICTS = [
  "Алмалинский р-н",
  "Ауэзовский р-н",
  "Бостандыкский р-н",
  "Медеуский р-н",
  "Наурызбайский р-н",
  "Турксибский р-н",
  "Жетысуский р-н",
  "Алатауский р-н",
];

const FLOOR_FILTERS = [
  { value: "low_rise", labelKey: "sidebar.floorLow" },
  { value: "mid_rise", labelKey: "sidebar.floorMid" },
  { value: "high_rise", labelKey: "sidebar.floorHigh" },
  { value: "skyscraper", labelKey: "sidebar.floorSky" },
];

const STAGE_FILTERS: { value: Stage; labelKey: string; color: string }[] = [
  { value: "building", labelKey: "map.featureBuilding", color: "text-feature-building" },
  { value: "new", labelKey: "map.featureNew", color: "text-feature-new" },
];

const RISK_FILTERS = [
  { value: "critical", labelKey: "sidebar.riskCritical", color: "bg-risk-critical" },
  { value: "high", labelKey: "sidebar.riskHigh", color: "bg-risk-high" },
  { value: "moderate", labelKey: "sidebar.riskModerate", color: "bg-risk-moderate" },
  { value: "low", labelKey: "sidebar.riskLow", color: "bg-risk-low" },
  { value: "safe", labelKey: "sidebar.riskSafe", color: "bg-risk-safe" },
];

function getSeismicColor(risk: string | null): string {
  const colors: Record<string, string> = {
    critical: "bg-risk-critical", high: "bg-risk-high", moderate: "bg-risk-moderate",
    low: "bg-risk-low", safe: "bg-risk-safe",
  };
  return colors[risk || ""] || "bg-muted-foreground";
}

function getSeismicLabelKey(risk: string | null): string | null {
  const keys: Record<string, string> = {
    critical: "sidebar.labelOnFault",
    high: "sidebar.labelHighRisk",
    moderate: "sidebar.labelModerate",
    low: "sidebar.labelLow",
    safe: "sidebar.labelSafe",
  };
  return keys[risk || ""] || null;
}

export function MapSidebar({ filters, selectedId, onSelect, onHover, isMobile }: MapSidebarProps) {
  const { t } = useTranslation();
  const [showFilters, setShowFilters] = useState(false);
  const {
    search, setSearch, district, setDistrict, risks, toggleRisk, floors, toggleFloor,
    stages, toggleStage, underConstructionCount, newBuildingCount, filtered, activeFilters,
  } = filters;
  const stageCounts: Record<Stage, number> = {
    building: underConstructionCount,
    new: newBuildingCount,
  };

  const resetFilters = () => {
    setSearch("");
    setDistrict("");
    risks.forEach(toggleRisk);
    floors.forEach(toggleFloor);
    filters.setStages([]);
  };

  return (
    <div className={`${isMobile ? "w-full" : "w-[360px] hidden lg:flex"} min-h-0 h-full bg-card border-r flex flex-col shrink-0`}>
      {/* Search */}
      <div className="max-h-[55%] shrink-0 overflow-y-auto p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("sidebar.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("sidebar.searchPlaceholder")}
            className="pl-9 h-11 text-base sm:text-sm"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-medium hover:bg-muted transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showFilters ? t("sidebar.filtersHide") : t("sidebar.filtersShow")}
          {activeFilters > 0 && (
            <span className="ml-1 text-primary">({activeFilters})</span>
          )}
        </button>

        {showFilters && (
          <div className="space-y-2 pt-1">
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              aria-label={t("sidebar.districts")}
              className="min-h-11 w-full bg-card text-sm border rounded-lg px-2 py-2"
            >
              <option value="">{t("sidebar.districts")}</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("sidebar.seismicRisk")}</p>
              <div className="flex flex-wrap gap-2">
                {RISK_FILTERS.map((rf) => (
                  <button
                    key={rf.value}
                    aria-pressed={risks.includes(rf.value)}
                    onClick={() => toggleRisk(rf.value)}
                    className={`inline-flex min-h-10 min-w-10 items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors ${
                      risks.includes(rf.value)
                        ? "bg-muted border-foreground text-foreground"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${rf.color}`} />
                    {t(rf.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("sidebar.floors")}</p>
              <div className="flex flex-wrap gap-2">
                {FLOOR_FILTERS.map((ff) => (
                  <button
                    key={ff.value}
                    aria-pressed={floors.includes(ff.value)}
                    onClick={() => toggleFloor(ff.value)}
                    className={`inline-flex min-h-10 min-w-10 items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors ${
                      floors.includes(ff.value)
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {t(ff.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {(underConstructionCount > 0 || newBuildingCount > 0) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("sidebar.stage")}</p>
                <div className="flex flex-wrap gap-2">
                  {STAGE_FILTERS.filter((sf) => stageCounts[sf.value] > 0).map((sf) => (
                    <button
                      key={sf.value}
                      aria-pressed={stages.includes(sf.value)}
                      onClick={() => toggleStage(sf.value)}
                      className={`inline-flex min-h-10 min-w-10 items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors ${
                        stages.includes(sf.value)
                          ? `${sf.color} bg-muted border-current`
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {sf.value === "building" ? <Construction className="h-4 w-4 text-feature-building" /> : <House className="h-4 w-4 text-feature-new" />}
                      {stages.includes(sf.value) && <Check className="h-3 w-3" />}
                      {t(sf.labelKey)} ({stageCounts[sf.value]})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p aria-live="polite" className="text-xs text-muted-foreground">
          {t("sidebar.complexesCount", { count: filtered.length })}
          {(search || activeFilters > 0) && ` ${t("sidebar.filtered")}`}
        </p>
      </div>

      {/* Complex list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
        {filtered.map((complex) => {
          const isSelected = complex.id === selectedId;
          const isHighRisk =
            complex.seismicRiskLevel === "critical" || complex.seismicRiskLevel === "high";

          return (
            <button
              type="button"
              aria-pressed={isSelected}
              key={complex.id}
              className={`flex w-full gap-3 rounded-xl border p-3 text-left cursor-pointer transition-colors ${
                isSelected
                  ? "bg-muted border-foreground shadow-sm"
                  : complex.isProblematic
                  ? "border-problematic/40 bg-problematic-surface"
                  : isHighRisk
                  ? "hover:bg-muted"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => onSelect(complex.id)}
              onMouseEnter={() => onHover(complex.id)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Photo */}
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {complex.photoUrl ? (
                  <img src={complex.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h4 className="text-sm font-semibold leading-5 break-words">{complex.displayName}</h4>
                  {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                    <Badge
                      className={`text-xs px-1.5 py-0 shrink-0 ${
                        complex.scoreTotal >= 85 ? "bg-green-500" : complex.scoreTotal >= 70 ? "bg-yellow-500" : "bg-orange-500"
                      } text-zinc-950 border-0`}
                    >
                      {Math.round(complex.scoreTotal)}%
                    </Badge>
                  )}
                </div>

                {complex.isProblematic && <span className="my-1 flex items-start gap-1.5 text-xs font-semibold text-problematic"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("map.problematicBadge")}</span>}
                {isUnderConstruction(complex) && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-feature-building">
                    <Construction className="h-3.5 w-3.5 shrink-0" /> {t("sidebar.badgeBuilding")}
                    {(() => {
                      const date = formatCompletion(complex, t);
                      return date ? ` · ${date}` : "";
                    })()}
                  </span>
                )}
                {isNewBuilding(complex) && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-feature-new">
                    <House className="h-3.5 w-3.5 shrink-0" /> {t("sidebar.badgeNew")} · {completedYear(complex)}
                  </span>
                )}

                <p className="text-xs leading-5 text-muted-foreground">
                  {complex.priceMin
                    ? complex.priceMin === complex.priceMax
                      ? formatPrice(complex.priceMin as number)
                      : `${formatPrice(complex.priceMin as number)} — ${formatPrice(complex.priceMax as number)}`
                    : ""}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {complex.seismicRiskLevel && (() => {
                    const labelKey = getSeismicLabelKey(complex.seismicRiskLevel);
                    return labelKey ? (
                      <span className="text-xs flex items-center gap-1 text-foreground">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-feature-seismic" />
                        <span className={`h-2 w-2 shrink-0 rounded-full ${getSeismicColor(complex.seismicRiskLevel)}`} />
                        {t(labelKey)}
                      </span>
                    ) : null;
                  })()}
                  {complex.commuteMinutes != null && complex.commuteMinutes > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {complex.commuteMinutes} {t("complex.minutes")}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Search className="mx-auto mb-3 h-7 w-7" />
            <p className="font-semibold text-foreground">{t("sidebar.noResults")}</p>
            <p className="mt-2 text-xs leading-relaxed">{t("sidebar.noResultsHint")}</p>
            <button onClick={resetFilters} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-foreground hover:bg-muted"><RotateCcw className="h-4 w-4" />{t("sidebar.resetFilters")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
