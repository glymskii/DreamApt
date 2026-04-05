"use client";

import { useComplex, useComplexProperties, useComplexShutov, useComplexSeismic } from "@/hooks/useComplexes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatArea } from "@/lib/utils";
import {
  X, MapPin, Clock, Star, Shield, AlertTriangle, Activity,
  Building, ChevronRight, Home, ExternalLink, Ruler,
} from "lucide-react";
import Link from "next/link";

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 85 ? "bg-green-500" : score >= 70 ? "bg-yellow-500" : "bg-orange-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(score)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

interface Props {
  complexId: string;
  onClose: () => void;
}

export function ComplexSlideOver({ complexId, onClose }: Props) {
  const { data: complex, isLoading } = useComplex(complexId);
  const { data: properties } = useComplexProperties(complexId);
  const { data: shutov } = useComplexShutov(complexId);
  const { data: seismic } = useComplexSeismic(complexId);

  const scoreColor = (complex?.scoreTotal ?? 0) >= 85
    ? "bg-green-500" : (complex?.scoreTotal ?? 0) >= 70
    ? "bg-yellow-500" : "bg-orange-500";

  const isHighRisk = seismic?.found &&
    (seismic.riskLevel === "critical" || seismic.riskLevel === "high");

  return (
    <div
      className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out"
      style={{ transform: "translateX(0)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h2 className="font-semibold text-sm truncate">
          {complex?.displayName || "Загрузка..."}
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded-md">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading || !complex ? (
          <div className="p-4 space-y-3 animate-pulse">
            <div className="h-40 bg-muted rounded" />
            <div className="h-6 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : (
          <>
            {/* Hero photo */}
            {complex.photoUrl && (
              <div className="h-48 bg-muted">
                <img src={complex.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Name + score */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">{complex.displayName}</h3>
                  {complex.district && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {complex.district}
                    </p>
                  )}
                </div>
                {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                  <Badge className={`${scoreColor} text-white border-0 text-lg px-3 py-1 shrink-0`}>
                    {Math.round(complex.scoreTotal)}%
                  </Badge>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Цена от</p>
                  <p className="font-bold text-sm">
                    {complex.priceMin ? `${Math.round(Number(complex.priceMin) / 1000000)} млн` : "—"}
                  </p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Объявлений</p>
                  <p className="font-bold text-sm">{complex.listingsCount}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">До работы</p>
                  <p className="font-bold text-sm">
                    {complex.commuteMinutes ? `${complex.commuteMinutes} мин` : "—"}
                  </p>
                </div>
              </div>

              {/* Seismic warning */}
              {isHighRisk && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-800">
                      {seismic.riskLevel === "critical" ? "На сейсмическом разломе" : "Опасная сейсмическая зона"}
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      {seismic.distanceMeters < 1000
                        ? `${seismic.distanceMeters} м`
                        : `${(seismic.distanceMeters / 1000).toFixed(1)} км`} до разлома
                    </p>
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Оценка ЖК</p>
                  <ScoreBar label="Инфраструктура" score={Number(complex.scoreInfrastructure) || 0} />
                  <ScoreBar label="Образ жизни" score={Number(complex.scoreLifestyle) || 0} />
                  <ScoreBar label="Дорога" score={Number(complex.scoreCommute) || 0} />
                  <ScoreBar label="Сейсмика" score={Number(complex.scoreSeismic) || 0} />
                </div>
              )}

              {/* Shutov rating */}
              {shutov?.found && (
                <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderLeftWidth: 4, borderLeftColor: shutov.categoryColor }}>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: shutov.categoryColor }}
                  >
                    {shutov.category}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{shutov.categoryLabel}</p>
                    <p className="text-xs text-muted-foreground">Тихон Шутов · {shutov.name}</p>
                  </div>
                </div>
              )}

              {/* Properties list */}
              {properties && properties.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Квартиры ({properties.length})
                  </p>
                  <div className="space-y-1.5">
                    {properties.slice(0, 5).map((prop: any) => (
                      <Link
                        key={prop.id}
                        href={`/projects/${prop.projectId}/property/${prop.id}`}
                        className="flex items-center gap-2 p-2 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                          {prop.photos?.[0] && (
                            <img src={prop.photos[0]} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{formatPrice(prop.price)}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {prop.rooms}-комн., {formatArea(prop.areaTotal)} · {prop.floor}/{prop.floorTotal} эт.
                          </p>
                        </div>
                        {prop.scoreTotal > 0 && (
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            prop.scoreTotal >= 85 ? "bg-green-500" : prop.scoreTotal >= 70 ? "bg-yellow-500" : "bg-orange-500"
                          } text-white border-0`}>
                            {Math.round(prop.scoreTotal)}%
                          </Badge>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </Link>
                    ))}
                    {properties.length > 5 && (
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        +{properties.length - 5} ещё
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {complex && (
        <div className="border-t px-4 py-3 shrink-0">
          <Link href={`/projects/${complex.projectId}/complex/${complex.id}`}>
            <Button className="w-full" size="sm">
              Подробнее о ЖК
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
