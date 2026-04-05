"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Building, Star, Activity, Home } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { ResidentialComplex } from "@/hooks/useComplexes";

const SHUTOV_LABELS: Record<number, string> = {
  0: "Идеально",
  1: "Отлично",
  2: "Хорошо",
  3: "Нормально",
  4: "Сомнительно",
  5: "Плохо",
};

const SEISMIC_ICONS: Record<string, { color: string; label: string }> = {
  critical: { color: "text-red-600", label: "Опасная зона" },
  high: { color: "text-red-500", label: "Высокий риск" },
  moderate: { color: "text-orange-500", label: "Умеренный" },
  low: { color: "text-yellow-600", label: "Низкий риск" },
  safe: { color: "text-green-600", label: "Безопасно" },
};

function getScoreColor(score: number) {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  return "bg-orange-500";
}

interface Props {
  complex: ResidentialComplex;
  onClick?: () => void;
}

export function ComplexCard({ complex, onClick }: Props) {
  const seismic = complex.seismicRiskLevel
    ? SEISMIC_ICONS[complex.seismicRiskLevel]
    : null;

  const isHighRisk =
    complex.seismicRiskLevel === "critical" || complex.seismicRiskLevel === "high";

  return (
    <Card
      className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
        isHighRisk ? "ring-1 ring-red-200 bg-red-50/30" : ""
      }`}
      onClick={onClick}
    >
      <div className="relative">
        {/* Photo */}
        <div className="h-44 bg-muted flex items-center justify-center">
          {complex.photoUrl ? (
            <img
              src={complex.photoUrl}
              alt={complex.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <Building className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Score badge */}
        {complex.scoreTotal != null && complex.scoreTotal > 0 && (
          <div
            className={`absolute top-3 left-3 ${getScoreColor(
              complex.scoreTotal,
            )} text-white text-sm font-bold px-2.5 py-1 rounded-full`}
          >
            {Math.round(complex.scoreTotal)}%
          </div>
        )}

        {/* Listings count badge */}
        <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
          <Home className="h-3 w-3" />
          {complex.listingsCount}
        </div>
      </div>

      <CardContent className="p-4">
        {/* Name */}
        <h3 className="font-semibold text-base mb-1 truncate">
          {complex.displayName}
        </h3>

        {/* Price range */}
        <p className="text-sm font-medium mb-2">
          {complex.priceMin && complex.priceMax ? (
            complex.priceMin === complex.priceMax ? (
              formatPrice(complex.priceMin)
            ) : (
              <>
                {formatPrice(complex.priceMin)} — {formatPrice(complex.priceMax)}
              </>
            )
          ) : (
            <span className="text-muted-foreground">Цена не указана</span>
          )}
        </p>

        {/* Tags row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {/* 2GIS rating */}
          {complex.twogisRating != null && complex.twogisRating > 0 && (
            <Badge variant="outline" className="text-xs gap-0.5 py-0">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {Number(complex.twogisRating).toFixed(1)}
            </Badge>
          )}

          {/* Shutov */}
          {complex.shutovCategory != null && (
            <Badge
              variant="outline"
              className={`text-xs py-0 ${
                complex.shutovCategory <= 2
                  ? "border-green-300 text-green-700"
                  : complex.shutovCategory <= 3
                  ? "border-yellow-300 text-yellow-700"
                  : "border-red-300 text-red-700"
              }`}
            >
              {SHUTOV_LABELS[complex.shutovCategory]}
            </Badge>
          )}

          {/* Seismic */}
          {seismic && (
            <Badge variant="outline" className={`text-xs py-0 ${seismic.color}`}>
              <Activity className="h-3 w-3 mr-0.5" />
              {seismic.label}
            </Badge>
          )}
        </div>

        {/* Bottom info */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {complex.district && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {complex.district}
            </span>
          )}
          {complex.commuteMinutes != null && complex.commuteMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {complex.commuteMinutes} мин
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
