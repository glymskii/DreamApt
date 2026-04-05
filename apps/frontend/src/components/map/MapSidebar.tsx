"use client";

import { useState, useMemo } from "react";
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

const RISK_FILTERS = [
  { value: "critical", label: "Опасная зона", color: "bg-red-500" },
  { value: "high", label: "Высокий", color: "bg-orange-500" },
  { value: "moderate", label: "Умеренный", color: "bg-yellow-500" },
  { value: "low", label: "Низкий", color: "bg-lime-500" },
  { value: "safe", label: "Безопасно", color: "bg-green-500" },
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

function getSeismicLabel(risk: string | null): string {
  const labels: Record<string, string> = {
    critical: "На разломе",
    high: "Высокий риск",
    moderate: "Умеренный",
    low: "Низкий",
    safe: "Безопасно",
  };
  return labels[risk || ""] || "";
}

export function MapSidebar({ data, selectedId, onSelect, onHover, isMobile }: MapSidebarProps) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
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

    return result.sort((a, b) => (Number(b.scoreTotal) || 0) - (Number(a.scoreTotal) || 0));
  }, [data.complexes, search, districtFilter, riskFilter]);

  const toggleRisk = (risk: string) => {
    setRiskFilter((prev) =>
      prev.includes(risk) ? prev.filter((r) => r !== risk) : [...prev, risk],
    );
  };

  return (
    <div className={`${isMobile ? "w-full" : "w-[340px] hidden lg:flex"} h-full bg-white border-r flex flex-col shrink-0`}>
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск ЖК..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showFilters ? "Скрыть фильтры" : "Фильтры"}
          {(districtFilter || riskFilter.length > 0) && (
            <span className="ml-1 text-primary">
              ({(districtFilter ? 1 : 0) + riskFilter.length})
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
              <option value="">Все районы</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Сейсмический риск</p>
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
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {filtered.length} ЖК {search || districtFilter || riskFilter.length > 0 ? "(отфильтровано)" : ""}
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
                isSelected ? "bg-blue-50" : isHighRisk ? "hover:bg-red-50/50" : "hover:bg-muted/50"
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
                  {complex.seismicRiskLevel && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${getSeismicColor(complex.seismicRiskLevel)}`}>
                      <Activity className="h-3 w-3" />
                      {getSeismicLabel(complex.seismicRiskLevel)}
                    </span>
                  )}
                  {complex.commuteMinutes != null && complex.commuteMinutes > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {complex.commuteMinutes} мин
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            ЖК не найдены
          </div>
        )}
      </div>
    </div>
  );
}
