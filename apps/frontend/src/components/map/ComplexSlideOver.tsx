"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useComplex,
  useComplexProperties,
  useComplexShutov,
  useComplexSeismic,
  useComplexAirQuality,
  useComplexReviews,
  type ReviewItem,
} from "@/hooks/useComplexes";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatArea } from "@/lib/utils";
import {
  X, MapPin, Clock, Star, Shield, AlertTriangle, Activity,
  Building, ChevronRight, Home, ExternalLink, Ruler, Lock, LogIn,
  MessageSquare, ThumbsUp, ChevronDown, Camera, MessageCircle,
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

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-4 w-4" : "h-3 w-3";
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${cls} ${
            s <= rounded ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

function ReviewItemRow({ review }: { review: ReviewItem }) {
  const { t, i18n } = useTranslation();
  const ratingColor =
    review.rating >= 4
      ? "text-green-600 dark:text-green-400"
      : review.rating >= 3
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";
  const dateLocale = i18n.language?.startsWith("kk") ? "kk-KZ" : "ru-RU";
  const date = review.dateCreated
    ? new Date(review.dateCreated).toLocaleDateString(dateLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const isLong = review.text.length > 180;
  const text = isLong ? review.text.slice(0, 180) + "…" : review.text;

  return (
    <div className="border-b last:border-0 py-2.5 first:pt-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-muted text-[10px] font-semibold flex items-center justify-center shrink-0">
            {review.userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate leading-tight">
              {review.userName}
            </p>
            {date && <p className="text-[10px] text-muted-foreground">{date}</p>}
          </div>
        </div>
        <div className={`flex items-center gap-0.5 shrink-0 ${ratingColor}`}>
          <span className="text-xs font-bold">{review.rating}</span>
          <Star className="h-3 w-3 fill-current" />
        </div>
      </div>
      {text && (
        <p className="text-[11px] leading-relaxed text-foreground/85 whitespace-pre-line">
          {text}
        </p>
      )}
      {(review.likesCount > 0 || review.photosCount > 0) && (
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          {review.likesCount > 0 && (
            <span className="flex items-center gap-0.5">
              <ThumbsUp className="h-2.5 w-2.5" />
              {review.likesCount}
            </span>
          )}
          {review.photosCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Camera className="h-2.5 w-2.5" />
              {review.photosCount}
            </span>
          )}
        </div>
      )}
      {review.officialAnswer?.text && (
        <div className="mt-1.5 ml-3 pl-2 border-l-2 border-blue-300 dark:border-blue-700">
          <div className="flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-400 font-medium">
            <MessageCircle className="h-2.5 w-2.5" />
            {review.officialAnswer.orgName || t("complex.officialAnswer")}
          </div>
          <p className="text-[11px] text-foreground/75 mt-0.5 line-clamp-2">
            {review.officialAnswer.text}
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewsSection({
  reviews,
  totalReviews,
  averageRating,
  twogisUrl,
}: {
  reviews: ReviewItem[];
  totalReviews: number;
  averageRating: number;
  twogisUrl: string | null;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const initialCount = 2;
  const visible = expanded ? reviews : reviews.slice(0, initialCount);
  const hasMore = reviews.length > initialCount;

  const ratingColor =
    averageRating >= 4
      ? "text-green-600 dark:text-green-400"
      : averageRating >= 3
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{t("complex.reviewsTitle")}</span>
          {totalReviews > 0 && (
            <span className="text-[10px] text-muted-foreground">
              · {totalReviews}
            </span>
          )}
        </div>
        {twogisUrl && (
          <a
            href={twogisUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
          >
            {t("complex.reviewsAll")}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {averageRating > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <span className={`text-2xl font-bold ${ratingColor}`}>
            {averageRating.toFixed(1)}
          </span>
          <div>
            <StarRow rating={averageRating} size="md" />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t("complex.reviewsCount", { count: totalReviews })}
            </p>
          </div>
        </div>
      )}

      {reviews.length > 0 ? (
        <div>
          {visible.map((r) => (
            <ReviewItemRow key={r.id} review={r} />
          ))}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-2 mx-auto"
            >
              {expanded
                ? t("common.collapse")
                : t("complex.reviewShowMore", { count: reviews.length - initialCount })}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {t("complex.reviewsHidden")}
        </p>
      )}
    </div>
  );
}

interface Props {
  complexId: string;
  onClose: () => void;
}

export function ComplexSlideOver({ complexId, onClose }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const authDialog = useAuthDialog();
  const { data: complex, isLoading } = useComplex(complexId);
  // Properties are gated server-side for guests; only fetch when authenticated.
  const { data: properties } = useComplexProperties(
    isAuthenticated ? complexId : "",
  );
  const { data: shutov } = useComplexShutov(complexId);
  const { data: seismic } = useComplexSeismic(complexId);
  const { data: airQuality } = useComplexAirQuality(complexId);
  const { data: reviews, isLoading: reviewsLoading } = useComplexReviews(complexId);

  const scoreColor = (complex?.scoreTotal ?? 0) >= 85
    ? "bg-green-500" : (complex?.scoreTotal ?? 0) >= 70
    ? "bg-yellow-500" : "bg-orange-500";

  const isHighRisk = seismic?.found &&
    (seismic.riskLevel === "critical" || seismic.riskLevel === "high");

  return (
    <div
      className="fixed z-50 bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out
        bottom-0 left-0 right-0 h-[75dvh] rounded-t-2xl
        sm:top-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-[420px] sm:rounded-none"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 sm:py-3 border-b shrink-0">
        <h2 className="font-semibold text-sm truncate">
          {complex?.displayName || t("common.loading")}
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
                  <p className="text-xs text-muted-foreground">{t("complex.priceFrom")}</p>
                  <p className="font-bold text-sm">
                    {complex.priceMin ? `${Math.round(Number(complex.priceMin) / 1000000)} млн` : "—"}
                  </p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("complex.listings")}</p>
                  <p className="font-bold text-sm">{complex.listingsCount}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("complex.commute")}</p>
                  <p className="font-bold text-sm">
                    {complex.commuteMinutes ? `${complex.commuteMinutes} ${t("complex.minutes")}` : "—"}
                  </p>
                </div>
              </div>

              {/* Seismic info — always show when data available */}
              {seismic?.found && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border ${
                  isHighRisk
                    ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"
                    : seismic.riskLevel === "moderate"
                    ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900"
                    : "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
                }`}>
                  {isHighRisk ? (
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <Activity className="h-4 w-4 shrink-0 mt-0.5" style={{ color: seismic.riskColor }} />
                  )}
                  <div>
                    <p className={`text-xs font-semibold ${
                      isHighRisk ? "text-red-800 dark:text-red-200" : seismic.riskLevel === "moderate" ? "text-yellow-800 dark:text-yellow-200" : "text-green-800 dark:text-green-200"
                    }`}>
                      {seismic.riskLabel}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      isHighRisk ? "text-red-700 dark:text-red-300" : "text-muted-foreground"
                    }`}>
                      {seismic.distanceMeters < 1000
                        ? `${seismic.distanceMeters} м`
                        : `${(seismic.distanceMeters / 1000).toFixed(1)} км`} {t("complex.seismicTo")} {seismic.nearestFault?.label?.toLowerCase() || t("complex.seismicFault")}
                    </p>
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("complex.ratingTitle")}</p>
                  <ScoreBar label={t("complex.scoreInfra")} score={Number(complex.scoreInfrastructure) || 0} />
                  <ScoreBar label={t("complex.scoreLifestyle")} score={Number(complex.scoreLifestyle) || 0} />
                  <ScoreBar label={t("complex.scoreCommute")} score={Number(complex.scoreCommute) || 0} />
                  <ScoreBar label={t("complex.scoreSeismic")} score={Number(complex.scoreSeismic) || 0} />
                </div>
              )}

              {/* Shutov rating — locked for guests */}
              {shutov?.found && shutov.locked ? (
                <button
                  onClick={() => authDialog.open("login", t("auth.shutovGate"))}
                  className="flex items-center gap-3 p-3 rounded-lg border w-full text-left hover:bg-muted/50 transition-colors"
                  style={{ borderLeftWidth: 4, borderLeftColor: "#94a3b8" }}
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{t("complex.shutovExpertTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {shutov.name
                        ? t("complex.shutovLockedHint", { name: shutov.name })
                        : t("complex.shutovEvaluatedHint")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ) : shutov?.found && !shutov.locked ? (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ borderLeftWidth: 4, borderLeftColor: shutov.categoryColor }}
                >
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: shutov.categoryColor }}
                  >
                    {shutov.category}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{shutov.categoryLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("complex.shutovBy", { name: shutov.name })}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Air quality (PM 2.5) */}
              {airQuality?.found && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ borderLeftWidth: 4, borderLeftColor: airQuality.color }}
                >
                  <span className="text-2xl">🌫</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-lg font-bold"
                        style={{ color: airQuality.color }}
                      >
                        {Number(airQuality.pm25).toFixed(1)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">µg/m³ PM 2.5</span>
                    </div>
                    <p
                      className="text-xs font-semibold"
                      style={{ color: airQuality.color }}
                    >
                      {airQuality.levelLabel}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {t("complex.airStation", { name: airQuality.station })}
                      {airQuality.distanceMeters
                        ? ` · ${airQuality.distanceMeters < 1000 ? airQuality.distanceMeters + " м" : (airQuality.distanceMeters / 1000).toFixed(1) + " км"}`
                        : ""}
                    </p>
                  </div>
                </div>
              )}

              {/* 2GIS reviews — public, key value prop of the platform */}
              {reviewsLoading ? (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold">{t("complex.reviewsTitle")}</span>
                  </div>
                  <div className="animate-pulse space-y-2">
                    <div className="h-6 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ) : reviews?.found ? (
                <ReviewsSection
                  reviews={reviews.reviews}
                  totalReviews={reviews.totalReviews}
                  averageRating={reviews.averageRating}
                  twogisUrl={reviews.twogisUrl}
                />
              ) : null}

              {/* Properties list — locked for guests */}
              {!isAuthenticated && (
                <button
                  onClick={() => authDialog.open("login", t("auth.propsGate"))}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted shrink-0">
                    <Home className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {t("complex.propsLockedTitle")}
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("complex.propsLockedSub")}
                    </p>
                  </div>
                  <LogIn className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              )}
              {isAuthenticated && properties && properties.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t("complex.apartmentsTitle", { count: properties.length })}
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
                            {t("complex.propertySummary", {
                              rooms: prop.rooms,
                              area: formatArea(prop.areaTotal),
                              floor: prop.floor,
                              total: prop.floorTotal,
                            })}
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
                        {t("complex.moreCount", { count: properties.length - 5 })}
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
          {isAuthenticated && complex.projectId ? (
            <Link href={`/projects/${complex.projectId}/complex/${complex.id}`}>
              <Button className="w-full" size="sm">
                {t("complex.moreDetails")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          ) : complex.krishaUrl ? (
            <a href={complex.krishaUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full" size="sm" variant="outline">
                <ExternalLink className="h-4 w-4 mr-1" />
                {t("complex.openOnKrisha")}
              </Button>
            </a>
          ) : !isAuthenticated ? (
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              onClick={() => authDialog.open("login", t("auth.complexDetailsGate"))}
            >
              <LogIn className="h-4 w-4 mr-1" />
              {t("complex.loginForDetails")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
