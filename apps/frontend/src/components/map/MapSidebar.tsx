"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Search, Activity, Building, Star, AlertTriangle } from "lucide-react";
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
  { value: "building", labelKey: "sidebar.stageBuilding", color: "bg-sky-600" },
  { value: "new", labelKey: "sidebar.stageNew", color: "bg-violet-600" },
];

const RISK_FILTERS = [
  { value: "critical", labelKey: "sidebar.riskCritical", color: "bg-red-500" },
  { value: "high", labelKey: "sidebar.riskHigh", color: "bg-orange-500" },
  { value: "moderate", labelKey: "sidebar.riskModerate", color: "bg-yellow-500" },
  { value: "low", labelKey: "sidebar.riskLow", color: "bg-lime-500" },
  { value: "safe", labelKey: "sidebar.riskSafe", color: "bg-green-500" },
];

function getSeismicColor(risk: string | null): string {
  const colors: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    moderate: "text-yellow-600",
    low: "text-lime-600",
    safe: "text-green-600",
  };
  return colors[risk || ""] || "text-gray-400";
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

  return (
    <div className={`${isMobile ? "w-full" : "w-[340px] hidden lg:flex"} h-full bg-card border-r flex flex-col shrink-0`}>
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("sidebar.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
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
              className="w-full text-xs border rounded-md px-2 py-1.5"
            >
              <option value="">{t("sidebar.districts")}</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{t("sidebar.seismicRisk")}</p>
              <div className="flex flex-wrap gap-1">
                {RISK_FILTERS.map((rf) => (
                  <button
                    key={rf.value}
                    onClick={() => toggleRisk(rf.value)}
                    className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                      risks.includes(rf.value)
                        ? `${rf.color} text-white border-transparent`
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {t(rf.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1">{t("sidebar.floors")}</p>
              <div className="flex flex-wrap gap-1">
                {FLOOR_FILTERS.map((ff) => (
                  <button
                    key={ff.value}
                    onClick={() => toggleFloor(ff.value)}
                    className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                      floors.includes(ff.value)
                        ? "bg-blue-500 text-white border-transparent"
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
                <p className="text-[10px] text-muted-foreground mb-1">{t("sidebar.stage")}</p>
                <div className="flex flex-wrap gap-1">
                  {STAGE_FILTERS.filter((sf) => stageCounts[sf.value] > 0).map((sf) => (
                    <button
                      key={sf.value}
                      onClick={() => toggleStage(sf.value)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        stages.includes(sf.value)
                          ? `${sf.color} text-white border-transparent`
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {t(sf.labelKey)} ({stageCounts[sf.value]})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {t("sidebar.complexesCount", { count: filtered.length })}
          {(search || activeFilters > 0) && ` ${t("sidebar.filtered")}`}
        </p>
      </div>

      {/* Complex list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((complex) => {
          const isSelected = complex.id === selectedId;
          const isHighRisk =
            complex.seismicRiskLevel === "critical" || complex.seismicRiskLevel === "high";

          return (
            <div
              key={complex.id}
              className={`flex gap-3 p-3 border-b cursor-pointer transition-colors ${
                isSelected
                  ? "bg-blue-50 dark:bg-blue-950/40"
                  : isHighRisk
                  ? "hover:bg-red-50/50 dark:hover:bg-red-950/30"
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
                  <h4 className="text-sm font-medium truncate">{complex.displayName}</h4>
                  {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                    <Badge
                      className={`text-[10px] px-1.5 py-0 shrink-0 ${
                        complex.scoreTotal >= 85 ? "bg-green-500" : complex.scoreTotal >= 70 ? "bg-yellow-500" : "bg-orange-500"
                      } text-white border-0`}
                    >
                      {Math.round(complex.scoreTotal)}%
                    </Badge>
                  )}
                </div>

                {isUnderConstruction(complex) && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                    🏗 {t("sidebar.badgeBuilding")}
                    {(() => {
                      const date = formatCompletion(complex, t);
                      return date ? ` · ${date}` : "";
                    })()}
                  </span>
                )}
                {isNewBuilding(complex) && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                    🏠 {t("sidebar.badgeNew")} · {completedYear(complex)}
                  </span>
                )}

                <p className="text-xs text-muted-foreground truncate">
                  {complex.priceMin
                    ? complex.priceMin === complex.priceMax
                      ? formatPrice(complex.priceMin as number)
                      : `${formatPrice(complex.priceMin as number)} — ${formatPrice(complex.priceMax as number)}`
                    : ""}
                </p>

                <div className="flex items-center gap-2 mt-0.5">
                  {complex.seismicRiskLevel && (() => {
                    const labelKey = getSeismicLabelKey(complex.seismicRiskLevel);
                    return labelKey ? (
                      <span className={`text-[10px] flex items-center gap-0.5 ${getSeismicColor(complex.seismicRiskLevel)}`}>
                        <Activity className="h-3 w-3" />
                        {t(labelKey)}
                      </span>
                    ) : null;
                  })()}
                  {complex.commuteMinutes != null && complex.commuteMinutes > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {complex.commuteMinutes} {t("complex.minutes")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("sidebar.noResults")}
          </div>
        )}
      </div>
    </div>
  );
}
