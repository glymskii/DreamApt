"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useComplex,
  useComplexProperties,
  useComplexShutov,
  useComplexAirQuality,
  useComplexAirHistory,
  useComplexReviews,
  type ReviewItem,
} from "@/hooks/useComplexes";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { RequestAccessModal } from "@/components/access/RequestAccessModal";
import { AirHistoryChart } from "@/components/complex/AirHistoryChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatArea } from "@/lib/utils";
import {
  completedYear,
  isNewBuilding,
  formatCompletion,
  housingClassKey,
  isCompletionOverdue,
  isUnderConstruction,
} from "@/lib/construction";
import {
  X, MapPin, Star, AlertTriangle, Activity, Wind, House,
  ChevronRight, Home, ExternalLink, Lock, LogIn,
  MessageSquare, ThumbsUp, ChevronDown, Camera, MessageCircle, Construction,
} from "lucide-react";
import Link from "next/link";

/**
 * Backend's `seismic.riskLabel` is hardcoded Russian (e.g. "Опасная зона")
 * — derive a translation key from the risk level instead so the badge
 * label localises cleanly. Reuses the keys defined under `map.*` for the
 * map popups so we don't duplicate strings.
 */
function getSeismicLabelKey(risk: string | null | undefined): string | null {
  const keys: Record<string, string> = {
    critical: "map.seismicOnFault",
    high: "map.seismicDanger",
    moderate: "map.seismicWatch",
    low: "map.seismicLow",
    safe: "map.seismicSafe",
  };
  return keys[risk || ""] || null;
}

/** Risk-level → icon color. Mirrors the colors that findNearestFault
 *  emits on the backend; kept here so the slide-over can render straight
 *  from the stored `complex.seismicRiskLevel` without a second API call
 *  to /complexes/:id/seismic (which has its own CDN cache layer and was
 *  occasionally serving stale classifications after threshold changes). */
function getSeismicIconColor(risk: string | null | undefined): string {
  const colors: Record<string, string> = {
    critical: "rgb(var(--risk-critical))",
    high: "rgb(var(--risk-high))",
    moderate: "rgb(var(--risk-moderate))",
    low: "rgb(var(--risk-low))",
    safe: "rgb(var(--risk-safe))",
  };
  return colors[risk || ""] || "#999";
}

/** Same idea for the AirKaz `levelLabel` — backend ships RU, we translate
 *  on the client by the structured `level` code. */
function getAirLabelKey(level: string | null | undefined): string | null {
  const keys: Record<string, string> = {
    good: "complex.airGood",
    moderate: "complex.airModerate",
    sensitive: "complex.airSensitive",
    unhealthy: "complex.airUnhealthy",
    very_unhealthy: "complex.airVeryUnhealthy",
    hazardous: "complex.airHazardous",
  };
  return keys[level || ""] || null;
}

/** One row in the per-fault-type proximity breakdown. Shows a colored dot
 *  matching the fault danger band (red/orange/grey for confirmed/studied/
 *  disputed) + the type label + the raw distance formatted naturally. */
function FaultDistanceRow({
  color,
  label,
  meters,
}: {
  color: string;
  label: string;
  meters: number;
}) {
  const { t } = useTranslation();
  const text = meters < 1000 ? t("common.meters", { value: meters }) : t("common.kilometers", { value: (meters / 1000).toFixed(1) });
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{text}</span>
    </div>
  );
}

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
      ? "text-green-700 dark:text-green-400"
      : review.rating >= 3
      ? "text-yellow-800 dark:text-yellow-400"
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
          <div className="w-6 h-6 rounded-full bg-muted text-xs font-semibold flex items-center justify-center shrink-0">
            {review.userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate leading-tight">
              {review.userName}
            </p>
            {date && <p className="text-xs text-muted-foreground">{date}</p>}
          </div>
        </div>
        <div className={`flex items-center gap-0.5 shrink-0 ${ratingColor}`}>
          <span className="text-xs font-bold">{review.rating}</span>
          <Star className="h-3 w-3 fill-current" />
        </div>
      </div>
      {text && (
        <p className="text-xs leading-relaxed text-foreground/85 whitespace-pre-line">
          {text}
        </p>
      )}
      {(review.likesCount > 0 || review.photosCount > 0) && (
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
          <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 font-medium">
            <MessageCircle className="h-2.5 w-2.5" />
            {review.officialAnswer.orgName || t("complex.officialAnswer")}
          </div>
          <p className="text-xs text-foreground/75 mt-0.5 line-clamp-2">
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
      ? "text-green-700 dark:text-green-400"
      : averageRating >= 3
      ? "text-yellow-800 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{t("complex.reviewsTitle")}</span>
          {totalReviews > 0 && (
            <span className="text-xs text-muted-foreground">
              · {totalReviews}
            </span>
          )}
        </div>
        {twogisUrl && (
          <a
            href={twogisUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-10 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
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
            <p className="text-xs text-muted-foreground mt-0.5">
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
              className="min-h-10 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-2 mx-auto"
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
        <p className="text-xs text-muted-foreground">
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
  const { t, i18n } = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const { isAuthenticated, user } = useAuth();
  const authDialog = useAuthDialog();
  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const { data: complex, isLoading } = useComplex(complexId);
  // Properties are gated server-side for guests; only fetch when authenticated.
  const { data: properties } = useComplexProperties(
    isAuthenticated ? complexId : "",
  );
  const { data: shutov } = useComplexShutov(complexId);
  const { data: airQuality } = useComplexAirQuality(complexId);
  const { data: airHistory, isLoading: airHistoryLoading } =
    useComplexAirHistory(complexId);
  const { data: reviews, isLoading: reviewsLoading } = useComplexReviews(complexId);

  // Seismic data is taken straight from the complex object (loaded by
  // useComplex). Avoids a second HTTP call that had its own CDN cache and
  // could end up disagreeing with the map marker after threshold changes.
  type SeismicBlock =
    | { found: true; riskLevel: string; distanceMeters: number; riskColor: string }
    | { found: false };
  const seismic: SeismicBlock =
    complex && complex.seismicRiskLevel && complex.seismicDistanceMeters != null
      ? {
          found: true,
          riskLevel: complex.seismicRiskLevel,
          distanceMeters: Number(complex.seismicDistanceMeters),
          riskColor: getSeismicIconColor(complex.seismicRiskLevel),
        }
      : { found: false };

  const scoreColor = (complex?.scoreTotal ?? 0) >= 85
    ? "bg-green-500" : (complex?.scoreTotal ?? 0) >= 70
    ? "bg-yellow-500" : "bg-orange-500";

  const isHighRisk = seismic.found &&
    (seismic.riskLevel === "critical" || seismic.riskLevel === "high");

  // Construction stage (Krisha «Новостройки»). The listing-derived
  // «2027 г.п.» year would only repeat «Срок сдачи», so it's hidden then.
  const underConstruction = isUnderConstruction(complex);
  const completion = complex ? formatCompletion(complex, t) : null;
  const classKey = housingClassKey(complex?.housingClass);
  const showYearBuilt = !!complex?.yearBuilt && !(underConstruction && completion);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complex-sheet-title"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
      className="public-map-ui fixed z-50 bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out
        bottom-0 left-0 right-0 h-[82dvh] rounded-t-2xl
        sm:top-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-[440px] sm:rounded-none"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-10 h-1 bg-border rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 sm:py-3 border-b shrink-0">
        <h2 id="complex-sheet-title" className="font-semibold text-lg leading-snug pr-2">
          {complex?.displayName || t("common.loading")}
        </h2>
        <button ref={closeButton} onClick={onClose} aria-label={t("common.close")} className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-muted rounded-lg">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading || !complex ? (
          <div className="p-4 space-y-3 animate-pulse">
            <div className="h-40 bg-muted rounded" />
            <div className="h-6 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              {/* Name + score */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  {complex.district && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {complex.district}
                    </p>
                  )}
                </div>
                {complex.scoreTotal != null && complex.scoreTotal > 0 && (
                  <Badge className={`${scoreColor} text-zinc-950 border-0 text-lg px-3 py-1 shrink-0`}>
                    {Math.round(complex.scoreTotal)}%
                  </Badge>
                )}
              </div>

              {/* Akimat warning banner — placed above all other sections so
                  the user sees it before scrolling into prices/reviews. The
                  source link points at the originating press release so the
                  user can verify the data is current. */}
              {complex.isProblematic && (
                <div className="rounded-xl border-2 border-problematic bg-problematic-surface p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-problematic shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-problematic">
                        {t("complex.problematicTitle")}
                      </p>
                      {complex.problematicReason && (
                        <p className="text-xs text-problematic mt-1 leading-snug">
                          {complex.problematicReason}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-problematic">
                        {complex.problematicUpdatedAt && (
                          <span>
                            {t("complex.problematicUpdated", {
                              date: new Date(complex.problematicUpdatedAt).toLocaleDateString(
                                i18n.language?.startsWith("kk") ? "kk-KZ" : "ru-RU",
                                { day: "numeric", month: "long", year: "numeric" },
                              ),
                            })}
                          </span>
                        )}
                        {complex.problematicSourceUrl && (
                          <a
                            href={complex.problematicSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:no-underline"
                          >
                            {t("complex.problematicSource")}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Construction stage — what a new-build buyer asks first:
                  is it finished, and when will it be. Developer / class
                  render for any ЖК the catalog sync has seen. */}
              {(underConstruction || isNewBuilding(complex) || complex.developer || classKey) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  {underConstruction && (
                    <div className="flex items-start gap-2">
                      <Construction className="h-4 w-4 text-feature-building shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-feature-building">
                          {t("complex.underConstruction")}
                          {completion && (
                            <span className="font-normal text-foreground">
                              {" · "}{t("complex.completion")}: <b>{completion}</b>
                            </span>
                          )}
                        </p>
                        {completion && isCompletionOverdue(complex) && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                            {t("complex.completionOverdue")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {isNewBuilding(complex) && <p className="flex items-center gap-2 text-sm font-semibold text-feature-new"><House className="h-4 w-4 shrink-0" />{t("map.popupNewBuilding", { year: completedYear(complex) })}</p>}
                  {(complex.developer || classKey) && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {complex.developer && (
                        <div className="min-w-0">
                          <p className="text-muted-foreground">{t("complex.developer")}</p>
                          <p className="font-medium break-words">
                            {complex.developer}
                          </p>
                        </div>
                      )}
                      {classKey && (
                        <div>
                          <p className="text-muted-foreground">{t("complex.housingClass")}</p>
                          <p className="font-medium">{t(classKey)}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{t("complex.constructionSource")}</p>
                </div>
              )}

              <section className="space-y-3 rounded-xl border p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-feature-seismic"><Activity className="h-4 w-4" />{t("map.featureSeismic")}</h3>
                {!seismic.found && <p className="text-xs text-muted-foreground">{t("complex.seismicUnavailable")}</p>}
              {/* Seismic info — always show when data available */}
              {seismic.found && (
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
                      {(() => {
                        // Label is derived from riskLevel via i18n keys —
                        // see getSeismicLabelKey above. Stays in sync with
                        // the map popup labels by reusing map.* keys.
                        const key = getSeismicLabelKey(seismic.riskLevel);
                        return key ? t(key) : "";
                      })()}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      isHighRisk ? "text-red-700 dark:text-red-300" : "text-muted-foreground"
                    }`}>
                      {t("complex.seismicDistance", {
                        distance:
                          seismic.distanceMeters < 1000
                            ? t("common.meters", { value: seismic.distanceMeters })
                            : t("common.kilometers", { value: (seismic.distanceMeters / 1000).toFixed(1) }),
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Per-fault-type breakdown. Confirmed is the trustworthy
                  signal that drives the badge; the others are supplementary
                  info. Show a studied/disputed row only when it's CLOSER
                  than the confirmed one — that's the case where the row
                  adds new information ("watch out, there's an even-closer
                  fault, though it's only weakly attested"). Hide it when
                  it's further away than confirmed: redundant noise that
                  doesn't help the reader. */}
              {(() => {
                if (!complex) return null;
                const confirmed = complex.seismicConfirmedM;
                const studied = complex.seismicStudiedM;
                const disputed = complex.seismicDisputedM;
                // If there's no confirmed reference, fall back to showing
                // whatever's available (rare edge case for our dataset).
                const showStudied = studied != null && (confirmed == null || studied < confirmed);
                const showDisputed = disputed != null && (confirmed == null || disputed < confirmed);
                const hasAny = confirmed != null || showStudied || showDisputed;
                if (!hasAny) return null;
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("complex.seismicBreakdown")}
                    </p>
                    {confirmed != null && (
                      <FaultDistanceRow
                        color="rgb(var(--risk-critical))"
                        label={t("complex.faultConfirmedShort")}
                        meters={confirmed}
                      />
                    )}
                    {showStudied && (
                      <FaultDistanceRow
                        color="rgb(var(--risk-high))"
                        label={t("complex.faultStudiedShort")}
                        meters={studied!}
                      />
                    )}
                    {showDisputed && (
                      <FaultDistanceRow
                        color="#9ca3af"
                        label={t("complex.faultDisputedShort")}
                        meters={disputed!}
                      />
                    )}
                  </div>
                );
              })()}

              {/* Seismic disclaimer — only shown when seismic data is present.
                  Distance to a fault by itself doesn't tell you whether a
                  building is safe; modern seismic codes (СНИП) compensate.
                  This block disclaims our service from making any safety
                  judgement and points users at the right paper trail to
                  request from the developer. Mainly defensive against
                  defamation claims (ст. 143 ГК РК) — the data is open and
                  we explicitly don't draw conclusions from it. */}
              {seismic?.found && (
                <p className="text-xs leading-snug text-muted-foreground px-1">
                  {t("complex.seismicDisclaimer")}
                </p>
              )}

              </section>

              {/* Air quality (PM 2.5) */}
              {airQuality?.found && (
                <div className="space-y-1">
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg border"
                    style={{ borderLeftWidth: 4, borderLeftColor: airQuality.color }}
                  >
                    <Wind className="h-5 w-5 shrink-0 text-feature-air" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-lg font-bold"
                        >
                          {Number(airQuality.pm25).toFixed(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">{t("map.pmTitle")}</span>
                      </div>
                      <p
                        className="text-xs font-semibold"
                      >
                        {(() => {
                          const key = getAirLabelKey(airQuality.level);
                          return key ? t(key) : airQuality.levelLabel || "";
                        })()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("complex.airStation", { name: airQuality.station })}
                        {airQuality.distanceMeters
                          ? ` · ${airQuality.distanceMeters < 1000 ? t("common.meters", { value: airQuality.distanceMeters }) : t("common.kilometers", { value: (airQuality.distanceMeters / 1000).toFixed(1) })}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {/* Disclaimer — explains the scale we picked (KZ daily ПДК
                      35 µg/m³) and notes the stricter WHO recommendation
                      (15 µg/m³). Defensive against "вы занижаете опасность"
                      criticism: we cite both bodies, user picks their own
                      threshold mentally. */}
                  <p className="text-xs leading-snug text-muted-foreground px-1">
                    {t("complex.airDisclaimer")}
                  </p>
                </div>
              )}

              {/* Historical PM2.5 pattern around this ЖК — by hour of day /
                  weekday. Sits right under the live reading so the user
                  reads "сейчас столько" then "а вообще тут вот так".
                  Renders its own empty state when history is thin, and
                  keeps working while the live upstream is down. */}
              <AirHistoryChart data={airHistory} isLoading={airHistoryLoading} />

            {/* Hero photo */}
            {complex.photoUrl && (
              <div className="h-48 bg-muted">
                <img src={complex.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}

              {/* Stats row. The "До работы" cell is gated behind auth — for
                  guests the commute is calculated against a project-wide
                  default destination that has nothing to do with where they
                  actually work, so the value is misleading. Authenticated
                  users see it because their project's interview captures a
                  real address. Grid columns flex 3→2 to avoid an empty cell. */}
              <div className={`grid gap-2 text-center ${isAuthenticated ? "grid-cols-3" : "grid-cols-2"}`}>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("complex.priceFrom")}</p>
                  <p className="font-bold text-sm">
                    {complex.priceMin ? t("common.millions", { value: Math.round(Number(complex.priceMin) / 1000000) }) : "—"}
                  </p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("complex.listings")}</p>
                  <p className="font-bold text-sm">{complex.listingsCount}</p>
                </div>
                {isAuthenticated && (
                  <div className="p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{t("complex.commute")}</p>
                    <p className="font-bold text-sm">
                      {complex.commuteMinutes ? `${complex.commuteMinutes} ${t("complex.minutes")}` : "—"}
                    </p>
                  </div>
                )}
              </div>

              {/* Building meta row — only renders when at least one value is
                  available. Older complexes (parsed before yearBuilt was
                  added) may have nulls; skip the whole block in that case. */}
              {(showYearBuilt || complex.floorsMax) && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  {showYearBuilt ? (
                    <div className="p-2 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t("complex.yearBuilt")}</p>
                      <p className="font-bold text-sm">{complex.yearBuilt}</p>
                    </div>
                  ) : null}
                  {complex.floorsMax ? (
                    <div className="p-2 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">{t("complex.floors")}</p>
                      <p className="font-bold text-sm">
                        {t("complex.floorsCount", { count: complex.floorsMax })}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Discussion follows the map's key data. Its auth gates remain
                  owned by CommentsSection. */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <CommentsSection complexId={complex.id} />
              </div>

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

              {/* Shutov rating — locked for guests AND for users without expertEnabled */}
              {shutov?.found && shutov.locked ? (
                <button
                  onClick={() => {
                    if (!user) {
                      authDialog.open("otp", t("auth.shutovGate"));
                    } else {
                      setExpertModalOpen(true);
                    }
                  }}
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
                    <p className="text-xs text-muted-foreground">
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
                    {properties.slice(0, 5).map((prop) => (
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
                          <p className="text-xs text-muted-foreground">
                            {t("complex.propertySummary", {
                              rooms: prop.rooms,
                              area: formatArea(prop.areaTotal),
                              floor: prop.floor,
                              total: prop.floorTotal,
                            })}
                          </p>
                        </div>
                        {prop.scoreTotal > 0 && (
                          <Badge className={`text-xs px-1.5 py-0 ${
                            prop.scoreTotal >= 85 ? "bg-green-500" : prop.scoreTotal >= 70 ? "bg-yellow-500" : "bg-orange-500"
                          } text-zinc-950 border-0`}>
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
        <div className="border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
          {isAuthenticated && complex.projectId ? (
            <Link href={`/projects/${complex.projectId}/complex/${complex.id}`}>
              <Button className="w-full min-h-11" size="sm">
                {t("complex.moreDetails")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          ) : !isAuthenticated ? (
            <Button
              className="w-full min-h-11"
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

      <RequestAccessModal
        open={expertModalOpen}
        onClose={() => setExpertModalOpen(false)}
        type="expert"
      />
    </div>
  );
}
