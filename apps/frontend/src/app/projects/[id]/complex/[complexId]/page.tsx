"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useComplex,
  useComplexProperties,
  useComplexShutov,
  useComplexSeismic,
} from "@/hooks/useComplexes";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatArea } from "@/lib/utils";
import {
  ArrowLeft, Building, MapPin, Clock, TrendingUp, Ruler,
  Calendar, Star, Shield, AlertTriangle, Activity, Home,
  ChevronRight, ExternalLink, SortAsc, Search,
} from "lucide-react";

const SHUTOV_LABELS: Record<number, string> = {
  0: "А ЧТО ТАК МОЖНО БЫЛО",
  1: "ПОЧТИ ИДЕАЛЬНО",
  2: "ВЕСЬМА НЕПЛОХО",
  3: "ПРОСТО НОРМАЛЬНО",
  4: "ПУСТЬ УЖЕ СТОИТ",
  5: "ЛУЧШЕ БЫ НЕ СТРОИЛИ",
};

const SHUTOV_COLORS: Record<number, string> = {
  0: "#7c3aed", 1: "#2563eb", 2: "#16a34a",
  3: "#eab308", 4: "#f97316", 5: "#dc2626",
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 85 ? "bg-green-500" : score >= 70 ? "bg-yellow-500" : "bg-orange-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(score)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const PROPERTY_SORTS = [
  { value: "scoreTotal", label: "По рейтингу" },
  { value: "price", label: "По цене" },
  { value: "area", label: "По площади" },
];

export default function ComplexDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const complexId = params.complexId as string;
  const [propSort, setPropSort] = useState("scoreTotal");

  const { data: complex, isLoading } = useComplex(complexId);
  const { data: properties } = useComplexProperties(complexId, propSort);
  const { data: shutovRating } = useComplexShutov(complexId);
  const { data: seismicRisk } = useComplexSeismic(complexId);

  if (isLoading || !complex) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-48 bg-muted rounded" />
          </div>
        </main>
      </div>
    );
  }

  const scoreColor = (complex.scoreTotal ?? 0) >= 85
    ? "bg-green-500" : (complex.scoreTotal ?? 0) >= 70
    ? "bg-yellow-500" : "bg-orange-500";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-8 max-w-5xl">
        {/* Nav */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
        </div>

        {/* Hero */}
        <div className="mb-6">
          {complex.photoUrl && (
            <div className="h-48 sm:h-64 md:h-80 rounded-lg overflow-hidden mb-4">
              <img src={complex.photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold">{complex.displayName}</h1>
              {complex.district && (
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-4 w-4" />
                  {complex.district}
                  {complex.address && ` · ${complex.address}`}
                </p>
              )}
            </div>
            {complex.scoreTotal != null && complex.scoreTotal > 0 && (
              <Badge className={`${scoreColor} text-white border-0 text-xl px-4 py-2 shrink-0`}>
                {Math.round(complex.scoreTotal)}%
              </Badge>
            )}
          </div>

          {/* Seismic warning banner */}
          {(complex.seismicRiskLevel === "critical" || complex.seismicRiskLevel === "high") && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {complex.seismicRiskLevel === "critical"
                    ? "Этот ЖК находится на сейсмическом разломе"
                    : "Этот ЖК находится в опасной сейсмической зоне"}
                </p>
                <p className="text-xs text-red-700 mt-1">
                  {complex.seismicDistanceMeters != null && (
                    <>
                      Расстояние до ближайшего разлома: {Number(complex.seismicDistanceMeters) < 1000
                        ? `${complex.seismicDistanceMeters} м`
                        : `${(Number(complex.seismicDistanceMeters) / 1000).toFixed(1)} км`}.{" "}
                    </>
                  )}
                  Рекомендуется запросить у застройщика результаты вибродинамических испытаний.
                </p>
              </div>
            </div>
          )}

          {/* Key stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Объявлений</p>
                <p className="text-lg font-bold">{complex.listingsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Цена от</p>
                <p className="text-lg font-bold">
                  {complex.priceMin ? `${Math.round(Number(complex.priceMin) / 1000000)} млн` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">До работы</p>
                <p className="text-lg font-bold">
                  {complex.commuteMinutes ? `${complex.commuteMinutes} мин` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">2GIS</p>
                <p className="text-lg font-bold flex items-center justify-center gap-1">
                  {complex.twogisRating ? (
                    <>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {Number(complex.twogisRating).toFixed(1)}
                    </>
                  ) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Score breakdown */}
            {complex.scoreTotal != null && complex.scoreTotal > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Оценка ЖК</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ScoreBar label="Инфраструктура" score={Number(complex.scoreInfrastructure) || 0} />
                  <ScoreBar label="Образ жизни" score={Number(complex.scoreLifestyle) || 0} />
                  <ScoreBar label="Дорога до работы" score={Number(complex.scoreCommute) || 0} />
                  <ScoreBar label="Сейсмическая безопасность" score={Number(complex.scoreSeismic) || 0} />
                </CardContent>
              </Card>
            )}

            {/* Properties list */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Home className="h-5 w-5" />
                    Объявления ({properties?.length || 0})
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <SortAsc className="h-3.5 w-3.5 text-muted-foreground" />
                  {PROPERTY_SORTS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={propSort === opt.value ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setPropSort(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {properties?.map((prop: any) => {
                    const propScoreColor = (prop.scoreTotal ?? 0) >= 85
                      ? "bg-green-500" : (prop.scoreTotal ?? 0) >= 70
                      ? "bg-yellow-500" : "bg-orange-500";

                    return (
                      <div
                        key={prop.id}
                        className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => router.push(`/projects/${projectId}/property/${prop.id}`)}
                      >
                        <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                          {prop.photos?.[0] ? (
                            <img src={prop.photos[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm">
                              {formatPrice(prop.price)}
                            </span>
                            {prop.scoreTotal > 0 && (
                              <Badge className={`${propScoreColor} text-white border-0 text-xs`}>
                                {Math.round(prop.scoreTotal)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {prop.rooms}-комн., {formatArea(prop.areaTotal)} · {prop.floor}/{prop.floorTotal} этаж
                          </p>
                          {prop.commuteMinutes > 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {prop.commuteMinutes} мин до работы
                            </p>
                          )}
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    );
                  })}
                  {(!properties || properties.length === 0) && (
                    <div className="text-center py-6 space-y-3">
                      <Building className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Объявления пока не найдены</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                          DreamApt показывает объявления только из ваших поисков.
                          Запустите новый поиск с нужными параметрами — и квартиры этого ЖК появятся здесь.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { useCreateProject } = await import("@/hooks/useProjects");
                          // Navigate to dashboard for new search
                          router.push("/dashboard");
                        }}
                      >
                        <Search className="h-3.5 w-3.5 mr-1" />
                        Новый поиск
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4 sm:space-y-6">
            {/* Shutov Rating */}
            {shutovRating?.found && (
              <Card
                className="border-l-4"
                style={{ borderLeftColor: shutovRating.categoryColor }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Рейтинг эксперта
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    по оценке Тихона Шутова
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white font-bold text-lg"
                      style={{ backgroundColor: shutovRating.categoryColor }}
                    >
                      {shutovRating.category}
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{shutovRating.categoryLabel}</p>
                      <p className="text-xs text-muted-foreground">{shutovRating.name}</p>
                    </div>
                  </div>
                  {shutovRating.description && (
                    <p className="text-xs text-muted-foreground whitespace-pre-line">
                      {shutovRating.description.length > 200
                        ? shutovRating.description.slice(0, 200) + "..."
                        : shutovRating.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Seismic Risk */}
            {seismicRisk?.found && (
              <Card
                className={`border-l-4 ${
                  seismicRisk.riskLevel === "critical" || seismicRisk.riskLevel === "high"
                    ? "bg-red-50"
                    : ""
                }`}
                style={{ borderLeftColor: seismicRisk.riskColor }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Сейсмическая безопасность
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full"
                      style={{ backgroundColor: seismicRisk.riskColor }}
                    >
                      {seismicRisk.riskLevel === "critical" || seismicRisk.riskLevel === "high" ? (
                        <AlertTriangle className="h-5 w-5 text-white" />
                      ) : (
                        <Shield className="h-5 w-5 text-white" />
                      )}
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{seismicRisk.riskLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {seismicRisk.distanceMeters < 1000
                          ? `${seismicRisk.distanceMeters} м`
                          : `${(seismicRisk.distanceMeters / 1000).toFixed(1)} км`}{" "}
                        до ближайшего разлома
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p><span className="font-medium">Разлом:</span> {seismicRisk.nearestFault?.name}</p>
                    <p><span className="font-medium">Тип:</span> {seismicRisk.nearestFault?.label}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Scoring explanation */}
            {complex.scoringExplanation && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Комментарий AI</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-line">{complex.scoringExplanation}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
