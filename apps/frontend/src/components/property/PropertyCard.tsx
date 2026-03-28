"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Clock, ArrowUpRight } from "lucide-react";
import { formatPrice, formatArea } from "@/lib/utils";

interface Props {
  property: {
    id: string;
    krishaUrl: string;
    title: string;
    price: number;
    rooms: number;
    areaTotal: number;
    floor: number;
    floorTotal: number;
    district: string;
    complexName: string;
    photos: string[];
    scoreTotal: number;
    commuteMinutes: number;
    commuteTrafficDirection: string;
    isWishlisted?: boolean;
  };
  onWishlistToggle?: (id: string, wishlisted: boolean) => void;
  onClick?: () => void;
}

function getScoreColor(score: number) {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  return "bg-orange-500";
}

function getTrafficLabel(direction: string) {
  if (direction === "against_traffic") return "Против потока";
  if (direction === "with_traffic") return "По потоку";
  return "";
}

export function PropertyCard({ property, onWishlistToggle, onClick }: Props) {
  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="relative">
        {/* Photo */}
        <div className="h-48 bg-muted flex items-center justify-center">
          {property.photos?.[0] ? (
            <img
              src={property.photos[0]}
              alt={property.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-muted-foreground text-sm">Нет фото</span>
          )}
        </div>

        {/* Score badge */}
        {property.scoreTotal > 0 && (
          <div
            className={`absolute top-3 left-3 ${getScoreColor(
              property.scoreTotal,
            )} text-white text-sm font-bold px-2.5 py-1 rounded-full`}
          >
            {Math.round(property.scoreTotal)}%
          </div>
        )}

        {/* Wishlist heart */}
        <button
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/80 hover:bg-white transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onWishlistToggle?.(property.id, !property.isWishlisted);
          }}
        >
          <Heart
            className={`h-5 w-5 ${
              property.isWishlisted
                ? "fill-red-500 text-red-500"
                : "text-gray-600"
            }`}
          />
        </button>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg">{formatPrice(property.price)}</h3>
          <a
            href={property.krishaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-primary"
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          {property.rooms}-комн., {formatArea(property.areaTotal)}, {property.floor}/{property.floorTotal} этаж
        </p>

        {property.complexName && (
          <p className="text-sm font-medium mb-2">{property.complexName}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {property.district}
          </span>
          {property.commuteMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {property.commuteMinutes} мин
              {property.commuteTrafficDirection && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {getTrafficLabel(property.commuteTrafficDirection)}
                </Badge>
              )}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
