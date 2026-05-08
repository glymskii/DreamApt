"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Search, Activity, Building, Star, AlertTriangle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { matchesSearch } from "@/lib/transliterate";
import type { MapData } from "@/hooks/useComplexes";

interface MapSidebarProps {
  data: MapData;
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

export function MapSidebar({ data, selectedId, onSelect, onHover, isMobile }: MapSidebarProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [floorFilter, setFloorFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = data.complexes;

    if (search) {
      result = result.filter(
        (c) =>
          matchesSearch(c.displayName, search) ||
          matchesSearch(c.district || "", search),
      );
    }

    if (districtFilter) {
      result = result.filter((c) => (c.district || "").includes(districtFilter));
    }

    if (riskFilter.length > 0) {
      result = result.filter((c) => riskFilter.includes(c.seismicRiskLevel || "safe"));
    }

    if (floorFilter.length > 0) {
      result = result.filter((c) => c.floorSegment && floorFilter.includes(c.floorSegment));
    }

    return result.sort((a, b) => (Number(b.scoreTotal) || 0) - (Number(a.scoreTotal) || 0));
  }, [data.complexes, search, districtFilter, riskFilter]);

  const toggleRisk = (risk: string) => {
    setRiskFilter((prev) =>
      prev.includes(risk) ? prev.filter((r) => r !== risk) : [...prev, risk],
    );
  };

  const toggleFloor = (floor: string) => {
    setFloorFilter((prev) =>
      prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor],
    );
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
          {(districtFilter || riskFilter.length > 0 || floorFilter.length > 0) && (
            <span className="ml-1 text-primary">
              ({(districtFilter ? 1 : 0) + riskFilter.length + floorFilter.length})
            </span>
          )}
        </button>

        {showFilters && (
          <div className="space-y-2 pt-1">
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
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
                      riskFilter.includes(rf.value)
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
                      floorFilter.includes(ff.value)
                        ? "bg-blue-500 text-white border-transparent"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {t(ff.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {t("sidebar.complexesCount", { count: filtered.length })}
          {(search || districtFilter || riskFilter.length > 0 || floorFilter.length > 0) && ` ${t("sidebar.filtered")}`}
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
