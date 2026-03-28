"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useProperty,
  useCJM,
  useReviews,
  useShutovRating,
  useSeismicRisk,
  ReviewItem,
  NearbyPlaceRef,
  CJMScenario,
  ShutovRatingResponse,
  SeismicRiskResponse,
} from "@/hooks/useProperties";
import { useToggleWishlist, useIsWishlisted } from "@/hooks/useWishlist";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatArea } from "@/lib/utils";
import {
  ArrowLeft,
  Heart,
  ExternalLink,
  MapPin,
  Clock,
  TrendingUp,
  Building,
  Ruler,
  Calendar,
  Sun,
  Briefcase,
  Star,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ThumbsUp,
  Camera,
  MessageCircle,
  Navigation,
  Shield,
  AlertTriangle,
  Activity,
} from "lucide-react";

/* ────────── Shutov Description (expandable) ────────── */
function ShutovDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  const display = isLong && !expanded ? text.slice(0, 200) + "..." : text;

  return (
    <div>
      <p className="text-xs whitespace-pre-line text-muted-foreground leading-relaxed">
        {display}
      </p>
      {isLong && (
        <button
          className="text-xs text-blue-600 hover:underline mt-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Свернуть" : "Читать полностью"}
        </button>
      )}
    </div>
  );
}

/* ────────── Score Bar ────────── */
function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 85
      ? "bg-green-500"
      : score >= 70
      ? "bg-yellow-500"
      : "bg-orange-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(score)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/* ────────── Star Rating ────────── */
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

/* ────────── 2GIS link helper ────────── */
function make2gisLink(placeName: string): string {
  return `https://2gis.kz/almaty/search/${encodeURIComponent(placeName)}`;
}

/* ────────── Linkify scenario text ────────── */
/**
 * Replace known place names in text with clickable 2GIS links.
 * Returns an array of ReactNode elements.
 */
function LinkifiedText({
  text,
  places,
}: {
  text: string;
  places: NearbyPlaceRef[];
}) {
  const parts = useMemo(() => {
    if (!places || places.length === 0) return [text];

    // Filter out places with empty/short names to avoid infinite regex loops
    const validPlaces = places.filter((p) => p.name && p.name.trim().length > 2);
    if (validPlaces.length === 0) return [text];

    // Sort place names by length (longest first) to avoid partial matches
    const sorted = [...validPlaces].sort(
      (a, b) => b.name.length - a.name.length,
    );

    // Build a regex that matches any place name (case-insensitive)
    const escaped = sorted.map((p) =>
      p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

    const segments: { text: string; isPlace: boolean; place?: NearbyPlaceRef }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), isPlace: false });
      }
      const matchedPlace = sorted.find(
        (p) => p.name.toLowerCase() === match![0].toLowerCase(),
      );
      segments.push({ text: match[0], isPlace: true, place: matchedPlace });
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), isPlace: false });
    }

    return segments;
  }, [text, places]);

  if (!Array.isArray(parts) || parts.length === 0) return <>{text}</>;
  if (typeof parts[0] === "string") return <>{text}</>;

  return (
    <>
      {(parts as { text: string; isPlace: boolean; place?: NearbyPlaceRef }[]).map(
        (seg, i) =>
          seg.isPlace ? (
            <a
              key={i}
              href={make2gisLink(seg.text)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 inline-flex items-center gap-0.5"
              title={`${seg.place?.address || ""} · ${
                seg.place
                  ? seg.place.distanceMeters < 1000
                    ? `${seg.place.distanceMeters} м`
                    : `${(seg.place.distanceMeters / 1000).toFixed(1)} км`
                  : ""
              }`}
            >
              {seg.text}
              <Navigation className="h-3 w-3 inline opacity-50" />
            </a>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
      )}
    </>
  );
}

/* ────────── Review Card ────────── */
function ReviewCard({ review }: { review: ReviewItem }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.text.length > 200;
  const displayText =
    isLong && !expanded ? review.text.slice(0, 200) + "..." : review.text;
  const date = review.dateCreated
    ? new Date(review.dateCreated).toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const ratingColor =
    review.rating >= 4
      ? "text-green-600"
      : review.rating >= 3
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div className="border-b last:border-0 pb-4 last:pb-0">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {review.userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{review.userName}</p>
            <p className="text-xs text-muted-foreground">{date}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-sm font-bold ${ratingColor}`}>
            {review.rating}
          </span>
          <Star className={`h-3.5 w-3.5 fill-current ${ratingColor}`} />
        </div>
      </div>

      <p className="text-sm leading-relaxed whitespace-pre-line">
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:underline mt-1"
        >
          {expanded ? "Свернуть" : "Читать полностью"}
        </button>
      )}

      {review.photoUrls.length > 0 && (
        <div className="flex gap-2 mt-2">
          {review.photoUrls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={`Фото ${i + 1}`}
                className="h-16 w-16 object-cover rounded-md border hover:opacity-80 transition-opacity"
              />
            </a>
          ))}
          {review.photosCount > review.photoUrls.length && (
            <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5 mr-0.5" />+
              {review.photosCount - review.photoUrls.length}
            </div>
          )}
        </div>
      )}

      {review.likesCount > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <ThumbsUp className="h-3 w-3" />
          {review.likesCount}
        </div>
      )}

      {review.officialAnswer && (
        <div className="mt-3 ml-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <MessageCircle className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              {review.officialAnswer.orgName}
            </span>
          </div>
          <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line">
            {review.officialAnswer.text.length > 150
              ? review.officialAnswer.text.slice(0, 150) + "..."
              : review.officialAnswer.text}
          </p>
        </div>
      )}
    </div>
  );
}

/* ────────── Reviews Section ────────── */
function ReviewsSection({ propertyId }: { propertyId: string }) {
  const { data: reviewsData, isLoading } = useReviews(propertyId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Отзывы о ЖК (2GIS)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!reviewsData || !reviewsData.twogisUrl) {
    return null;
  }

  const ratingColor =
    reviewsData.averageRating >= 4
      ? "text-green-600"
      : reviewsData.averageRating >= 3
      ? "text-yellow-600"
      : "text-red-600";

  const reviews = reviewsData.reviews || [];
  const visibleReviews = showAll ? reviews : reviews.slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Отзывы о ЖК (2GIS)
          </CardTitle>
          {reviewsData.twogisUrl && (
            <a
              href={reviewsData.twogisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              Все на 2GIS
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Rating summary */}
        <div className="flex items-center gap-4 mb-5 p-3 bg-muted/50 rounded-lg">
          {reviewsData.averageRating > 0 && (
            <div className="flex items-center gap-3">
              <span className={`text-4xl font-bold ${ratingColor}`}>
                {reviewsData.averageRating.toFixed(1)}
              </span>
              <div>
                <StarRating
                  rating={Math.round(reviewsData.averageRating)}
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reviewsData.totalReviews} отзывов
                </p>
              </div>
            </div>
          )}
          <div className="ml-auto text-right">
            {reviewsData.buildingName && (
              <p className="text-sm font-medium">{reviewsData.buildingName}</p>
            )}
            {reviewsData.address && (
              <p className="text-xs text-muted-foreground">
                {reviewsData.address}
              </p>
            )}
          </div>
        </div>

        {reviews.length > 0 ? (
          <div className="space-y-4">
            {visibleReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}

            {reviews.length > 3 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-1 transition-colors"
              >
                {showAll
                  ? "Свернуть"
                  : `Показать ещё ${reviews.length - 3} отзывов`}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Отзывы не найдены.{" "}
            {reviewsData.twogisUrl && (
              <a
                href={reviewsData.twogisUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Посмотреть на 2GIS
              </a>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ────────── CJM Scenario Card with 2GIS links ────────── */
function ScenarioCard({
  scenario,
  isExpanded,
  onToggle,
  places,
}: {
  scenario: CJMScenario;
  isExpanded: boolean;
  onToggle: () => void;
  places: NearbyPlaceRef[];
}) {
  return (
    <div
      className="border rounded-lg p-4 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-medium">{scenario.title}</h4>
        <Badge variant="outline">{Math.round(scenario.matchScore)}%</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        <LinkifiedText text={scenario.summary} places={places} />
      </p>
      {isExpanded && scenario.detail && (
        <div className="mt-3 pt-3 border-t text-sm whitespace-pre-line">
          <LinkifiedText text={scenario.detail} places={places} />
        </div>
      )}
      {scenario.tags?.length > 0 && (
        <div className="flex gap-1 mt-2">
          {scenario.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────── Recommended Properties ────────── */
interface RecommendedProperty {
  id: string;
  title: string;
  complexName: string;
  district: string;
  price: number;
  rooms: number;
  areaTotal: number;
  scoreTotal: number;
  photos: string[];
  commuteMinutes: number;
}

function RecommendedPropertiesSection({
  properties,
  projectId,
}: {
  properties: RecommendedProperty[];
  projectId: string;
}) {
  const router = useRouter();

  if (!properties || properties.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Рекомендации с более высоким рейтингом
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          ЖК с более высоким процентом соответствия вашим критериям
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {properties.map((prop) => {
            const scoreColor =
              prop.scoreTotal >= 85
                ? "bg-green-500"
                : prop.scoreTotal >= 70
                ? "bg-yellow-500"
                : "bg-orange-500";

            return (
              <div
                key={prop.id}
                className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() =>
                  router.push(
                    `/projects/${projectId}/property/${prop.id}`,
                  )
                }
              >
                <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                  {prop.photos?.[0] ? (
                    <img
                      src={prop.photos[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-medium text-sm truncate">
                      {prop.complexName || prop.title}
                    </h4>
                    <Badge
                      className={`${scoreColor} text-white border-0 text-xs flex-shrink-0`}
                    >
                      {Math.round(prop.scoreTotal)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {prop.rooms}-комн., {formatArea(prop.areaTotal)} ·{" "}
                    {prop.district}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm font-medium">
                      {formatPrice(prop.price)}
                    </span>
                    {prop.commuteMinutes > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {prop.commuteMinutes} мин
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────── MAIN PAGE ────────── */
export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const propertyId = params.propertyId as string;

  const { data: property, isLoading } = useProperty(propertyId);
  const { data: cjm, isLoading: cjmLoading } = useCJM(propertyId);
  const { data: shutovRating } = useShutovRating(propertyId);
  const { data: seismicRisk } = useSeismicRisk(propertyId);
  const { add, remove } = useToggleWishlist();
  const { data: isWishlisted } = useIsWishlisted(propertyId);
  const [activeTab, setActiveTab] = useState<"weekday" | "weekend">("weekday");
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [isRescoring, setIsRescoring] = useState(false);

  const needsRescore =
    property &&
    (!property.scoringExplanation ||
      property.scoringExplanation.includes("Mock") ||
      property.scoringExplanation.includes("API ключ не установлен"));

  useEffect(() => {
    if (needsRescore) {
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ["property", propertyId],
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [needsRescore, propertyId, queryClient]);

  const handleRescore = async () => {
    setIsRescoring(true);
    try {
      await api.post(`/properties/${propertyId}/rescore`, {});
      queryClient.invalidateQueries({
        queryKey: ["property", propertyId],
      });
    } catch (err) {
      console.error("Rescore failed:", err);
    } finally {
      setIsRescoring(false);
    }
  };

  // Get nearby places from CJM response for 2GIS linkification
  const nearbyPlaces: NearbyPlaceRef[] = cjm?.nearbyPlaces || [];

  if (isLoading || !property) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Nav */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push(`/projects/${projectId}/results`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            К результатам
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (isWishlisted) {
                  remove.mutate(property.id);
                } else {
                  add.mutate(property.id);
                }
              }}
            >
              <Heart
                className={`h-4 w-4 mr-2 ${
                  isWishlisted ? "fill-red-500 text-red-500" : ""
                }`}
              />
              {isWishlisted ? "В избранном" : "В избранное"}
            </Button>
            <Button asChild>
              <a
                href={property.krishaUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Krisha.kz
              </a>
            </Button>
          </div>
        </div>

        {/* Photo gallery */}
        <div className="grid grid-cols-4 gap-2 mb-6 h-80 rounded-lg overflow-hidden">
          {property.photos?.length > 0 ? (
            <>
              <div className="col-span-2 row-span-2">
                <img
                  src={property.photos[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              {property.photos
                .slice(1, 5)
                .map((photo: string, i: number) => (
                  <div key={i}>
                    <img
                      src={photo}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
            </>
          ) : (
            <div className="col-span-4 bg-muted flex items-center justify-center">
              <span className="text-muted-foreground">Нет фото</span>
            </div>
          )}
        </div>

        {/* ═══════════ TWO COLUMN LAYOUT ═══════════ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ────── LEFT COLUMN (2/3 width) ────── */}
          {/* Priority order: Details → Reviews → CJM → Recommendations */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Property details — always first */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl">
                    {formatPrice(property.price)}
                  </CardTitle>
                  {property.scoreTotal > 0 && (
                    <Badge
                      className={`text-lg px-3 py-1 ${
                        property.scoreTotal >= 85
                          ? "bg-green-500"
                          : property.scoreTotal >= 70
                          ? "bg-yellow-500"
                          : "bg-orange-500"
                      } text-white border-0`}
                    >
                      {Math.round(property.scoreTotal)}%
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <h2 className="text-lg font-medium mb-4">{property.title}</h2>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{property.complexName || "\u2014"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{property.district}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {property.rooms}-комн., {formatArea(property.areaTotal)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {property.floor}/{property.floorTotal} этаж
                    </span>
                  </div>
                  {property.commuteMinutes > 0 && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{property.commuteMinutes} мин до работы</span>
                    </div>
                  )}
                  {property.yearBuilt && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{property.yearBuilt} г.</span>
                    </div>
                  )}
                </div>

                {property.address && (
                  <p className="text-sm text-muted-foreground mt-4">
                    {property.address}
                  </p>
                )}

                {property.description && (
                  <p className="text-sm mt-4 whitespace-pre-line">
                    {property.description}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 2. Reviews — social proof is critical for decisions */}
            <ReviewsSection propertyId={propertyId} />

            {/* 3. CJM Scenarios with 2GIS-linked places */}
            <Card>
              <CardHeader>
                <CardTitle>Сценарии жизни</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Названия мест кликабельны — открываются в 2GIS
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={activeTab === "weekday" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("weekday")}
                  >
                    <Briefcase className="h-4 w-4 mr-1" />
                    Будни
                  </Button>
                  <Button
                    variant={activeTab === "weekend" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("weekend")}
                  >
                    <Sun className="h-4 w-4 mr-1" />
                    Выходные
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {cjmLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                        <div className="h-3 bg-muted rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : cjm && cjm[activeTab]?.length > 0 ? (
                  <div className="space-y-3">
                    {cjm[activeTab].map((scenario) => (
                      <ScenarioCard
                        key={scenario.id}
                        scenario={scenario}
                        isExpanded={expandedScenario === scenario.id}
                        onToggle={() =>
                          setExpandedScenario(
                            expandedScenario === scenario.id
                              ? null
                              : scenario.id,
                          )
                        }
                        places={nearbyPlaces}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Сценарии ещё не сгенерированы
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 4. Recommended properties with higher scores */}
            {cjm?.recommendedProperties && (
              <RecommendedPropertiesSection
                properties={cjm.recommendedProperties}
                projectId={projectId}
              />
            )}
          </div>

          {/* ────── RIGHT COLUMN (1/3 width) ────── */}
          <div className="space-y-6">
            {/* Score breakdown */}
            {property.scoreTotal > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Оценка</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ScoreBar
                    label="Дорога до работы"
                    score={property.scoreCommute}
                  />
                  <ScoreBar
                    label="Инфраструктура"
                    score={property.scoreInfrastructure}
                  />
                  <ScoreBar
                    label="Образ жизни"
                    score={property.scoreLifestyle}
                  />
                  <ScoreBar
                    label="Цена/качество"
                    score={property.scoreValue ?? 0}
                  />
                </CardContent>
              </Card>
            )}

            {/* Shutov-Tikhonov Expert Rating */}
            {shutovRating?.found && (
              <Card className="border-l-4" style={{ borderLeftColor: shutovRating.categoryColor }}>
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
                      <p className="text-xs text-muted-foreground">
                        {shutovRating.name}
                      </p>
                    </div>
                  </div>
                  {shutovRating.description && (
                    <ShutovDescription text={shutovRating.description} />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Seismic Risk */}
            {seismicRisk?.found && (
              <Card
                className={`border-l-4 ${
                  seismicRisk.riskLevel === "critical" || seismicRisk.riskLevel === "high"
                    ? "bg-red-50 dark:bg-red-950/20"
                    : ""
                }`}
                style={{ borderLeftColor: seismicRisk.riskColor }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Сейсмическая безопасность
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    по карте разломов Тихона Шутова
                  </p>
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
                        {seismicRisk.distanceMeters! < 1000
                          ? `${seismicRisk.distanceMeters} м`
                          : `${(seismicRisk.distanceMeters! / 1000).toFixed(1)} км`}{" "}
                        до ближайшего разлома
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <span className="font-medium">Разлом:</span>{" "}
                      {seismicRisk.nearestFault?.name}
                    </p>
                    <p>
                      <span className="font-medium">Тип:</span>{" "}
                      {seismicRisk.nearestFault?.label}
                    </p>
                  </div>
                  {(seismicRisk.riskLevel === "critical" || seismicRisk.riskLevel === "high") && (
                    <div className="flex items-start gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-800 dark:text-red-200">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p>
                        ЖК находится в зоне повышенного сейсмического риска.
                        Рекомендуется запросить у застройщика результаты
                        вибродинамических испытаний.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Comment */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Комментарий AI</CardTitle>
                  {needsRescore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRescore}
                      disabled={isRescoring}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-1 ${isRescoring ? "animate-spin" : ""}`}
                      />
                      {isRescoring ? "Оцениваем..." : "Пересчитать"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {needsRescore ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Генерируем AI-комментарий...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Оценка обновится автоматически через несколько секунд
                    </p>
                  </div>
                ) : property.scoringExplanation ? (
                  <p className="text-sm whitespace-pre-line">
                    {property.scoringExplanation}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Комментарий пока не сгенерирован
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Nearby places quick reference */}
            {nearbyPlaces.filter((p) => p.name?.trim()).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Рядом
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {nearbyPlaces.filter((p) => p.name?.trim()).slice(0, 8).map((place, i) => {
                      const dist =
                        place.distanceMeters < 1000
                          ? `${place.distanceMeters} м`
                          : `${(place.distanceMeters / 1000).toFixed(1)} км`;
                      const icon =
                        place.category === "park"
                          ? "🌳"
                          : place.category === "gym"
                          ? "💪"
                          : place.category === "cafe"
                          ? "☕"
                          : place.category === "mall"
                          ? "🛍"
                          : place.category === "school"
                          ? "🏫"
                          : place.category === "hospital"
                          ? "🏥"
                          : "📍";
                      return (
                        <a
                          key={i}
                          href={make2gisLink(place.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm hover:bg-accent/50 rounded px-2 py-1.5 -mx-2 transition-colors group"
                        >
                          <span className="text-base">{icon}</span>
                          <span className="flex-1 truncate group-hover:text-blue-600">
                            {place.name}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {dist}
                          </span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
