"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ResidentialComplex {
  id: string;
  projectId: string | null;
  name: string;
  displayName: string;
  krishaComplexId: string | null;
  krishaUrl: string | null;
  lat: number | null;
  lng: number | null;
  district: string | null;
  address: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceAvg: number | null;
  listingsCount: number;
  scoreTotal: number | null;
  scoreInfrastructure: number | null;
  scoreLifestyle: number | null;
  scoreCommute: number | null;
  scoreSeismic: number | null;
  commuteMinutes: number | null;
  commuteTrafficDirection: string | null;
  twogisRating: number | null;
  twogisReviewCount: number | null;
  shutovCategory: number | null;
  seismicRiskLevel: string | null;
  seismicDistanceMeters: number | null;
  seismicConfirmedM: number | null;
  seismicStudiedM: number | null;
  seismicDisputedM: number | null;
  floorsMax: number | null;
  floorSegment: string | null;
  yearBuilt: number | null;
  groupingMethod: string | null;
  scoringExplanation: string | null;
  photoUrl: string | null;
  // Акимат пометил ЖК как проблемный — нет полного пакета разрешительной
  // документации либо стройка идёт с отклонениями. Surfaced as a red
  // marker style on the map + warning banner in the slide-over.
  isProblematic?: boolean;
  problematicReason?: string | null;
  problematicSourceUrl?: string | null;
  problematicUpdatedAt?: string | null;
  // True for auto-created stubs (akimat-listed но в нашем классификаторе
  // не нашлось ничего похожего). Used by the slide-over to suppress
  // empty Krisha sections (no listings/scores to show).
  isStub?: boolean;
  createdAt: string;
}

export interface ComplexListResponse {
  complexes: ResidentialComplex[];
  total: number;
  page: number;
  totalPages: number;
}

export function useComplexes(projectId: string, sort: string = "scoreTotal", page: number = 1) {
  return useQuery({
    queryKey: ["complexes", projectId, sort, page],
    queryFn: () =>
      api.get<ComplexListResponse>(
        `/projects/${projectId}/complexes?sort=${sort}&page=${page}&limit=20`,
      ),
    enabled: !!projectId,
  });
}

export function useComplex(complexId: string) {
  return useQuery({
    queryKey: ["complex", complexId],
    queryFn: () => api.get<ResidentialComplex>(`/complexes/${complexId}`),
    enabled: !!complexId,
  });
}

export function useComplexProperties(complexId: string, sort: string = "scoreTotal") {
  return useQuery({
    queryKey: ["complex-properties", complexId, sort],
    queryFn: () =>
      api.get<{ properties: any[] }>(`/complexes/${complexId}/properties?sort=${sort}`),
    enabled: !!complexId,
    select: (data) => data.properties,
  });
}

export interface ShutovResponse {
  found: boolean;
  locked?: boolean;
  name?: string;
  category?: number;
  categoryLabel?: string;
  categoryColor?: string;
  description?: string;
}

export function useComplexShutov(complexId: string) {
  return useQuery({
    queryKey: ["complex-shutov", complexId],
    queryFn: () => api.get<ShutovResponse>(`/complexes/${complexId}/shutov`),
    enabled: !!complexId,
  });
}

export function useComplexSeismic(complexId: string) {
  return useQuery({
    queryKey: ["complex-seismic", complexId],
    queryFn: () => api.get<any>(`/complexes/${complexId}/seismic`),
    enabled: !!complexId,
  });
}

export interface ReviewItem {
  id: string;
  rating: number;
  text: string;
  userName: string;
  dateCreated: string;
  likesCount: number;
  photosCount: number;
  photoUrls: string[];
  officialAnswer?: { text: string; orgName: string } | null;
}

export interface ComplexReviewsResponse {
  found: boolean;
  totalReviews: number;
  averageRating: number;
  reviews: ReviewItem[];
  twogisUrl: string | null;
  buildingName?: string;
  address?: string;
}

export function useComplexReviews(complexId: string) {
  return useQuery({
    queryKey: ["complex-reviews", complexId],
    queryFn: () =>
      api.get<ComplexReviewsResponse>(`/complexes/${complexId}/reviews`),
    enabled: !!complexId,
    // Reviews don't change minute-to-minute. Long cache to avoid re-hammering 2GIS.
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useComplexAirQuality(complexId: string) {
  return useQuery({
    queryKey: ["complex-air-quality", complexId],
    queryFn: () => api.get<any>(`/complexes/${complexId}/air-quality`),
    enabled: !!complexId,
    staleTime: 15 * 60 * 1000, // match server cache
  });
}

export interface AirHistoryResponse {
  found: boolean;
  coverage: {
    totalRows: number;
    stations: number;
    firstReading: string | null;
    lastReading: string | null;
    daysSpanned: number;
    sufficient: boolean;
  };
  location: {
    lat: number;
    lng: number;
    radiusKm: number;
    samples: number;
    avgPm25: number | null;
    byHour: { hour: number; avgPm25: number; samples: number }[];
    byWeekday: { weekday: number; avgPm25: number; samples: number }[];
  } | null;
}

/** Historical PM2.5 averages around a complex, bucketed by hour of day and
 *  weekday. Backed by our own archive, so it keeps working even while the
 *  live upstream is down. */
export function useComplexAirHistory(complexId: string) {
  return useQuery({
    queryKey: ["complex-air-history", complexId],
    queryFn: () =>
      api.get<AirHistoryResponse>(`/complexes/${complexId}/air-quality/history`),
    enabled: !!complexId,
    staleTime: 30 * 60 * 1000,
  });
}

export interface AirStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  pm25: number;
  origin: string | null;
  district: string | null;
  level: "good" | "moderate" | "sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";
  levelLabel: string;
  color: string;
  updatedAt: string;
}

export interface MapData {
  complexes: Array<{
    id: string;
    displayName: string;
    lat: number;
    lng: number;
    scoreTotal: number | null;
    priceAvg: number | null;
    listingsCount: number;
    seismicRiskLevel: string | null;
    seismicDistanceMeters: number | null;
    seismicConfirmedM: number | null;
    seismicStudiedM: number | null;
    seismicDisputedM: number | null;
    commuteMinutes: number | null;
    photoUrl: string | null;
    district: string | null;
    priceMin: number | null;
    priceMax: number | null;
    shutovCategory: number | null;
    floorsMax: number | null;
    floorSegment: string | null;
    yearBuilt: number | null;
    airQualityPm25: number | null;
    airQualityLevel: string | null;
    airQualityStation: string | null;
    twogisRating: number | null;
    twogisReviewCount: number | null;
    isProblematic?: boolean;
    problematicReason?: string | null;
    problematicSourceUrl?: string | null;
    problematicUpdatedAt?: string | null;
    isStub?: boolean;
    // Latest comment breadcrumb for the map hover. Absent when the ЖК
    // has no comments yet (hover then shows a "be first" nudge).
    lastComment?: { text: string; author: string; count: number } | null;
  }>;
  airStations?: AirStation[];
  faultLines: Array<{
    name: string;
    level: string;
    label: string;
    danger: number;
    coordinates: [number, number][];
  }>;
  // Almaty admin boundary — single Polygon Feature; drawn as a thin
  // outline on the map. Both nullable so older API responses don't
  // break the frontend.
  cityBoundary?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: { name: string; admin_level: number; source: string };
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }>;
  };
  urbanPlans?: {
    source: {
      primary: string;
      primaryUrl: string;
      fullMapUrl: string;
      officialAuthority: string;
      authorityUrl: string;
      newsContext: string;
      lastUpdated: string;
    };
    phases: Array<{
      year: number;
      label: string;
      streets: Array<{ name: string; zone: string; segment: string }>;
    }>;
  };
  // GeoJSON polylines for the streets in `urbanPlans`, one Feature per
  // OSM way. Each feature carries `{ name, year }`. Rendered as a hidden-
  // by-default map layer with year-coloured strokes.
  urbanPlanGeometry?: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: { name: string; year: number };
      geometry: { type: "LineString"; coordinates: number[][] };
    }>;
  };
  // Admin-calibrated overlay configs (raster image corner positions +
  // opacity). Map renderer reads `overlays.find(o => o.key === ...)`
  // to position image sources — values are editable in /admin/genplan-align.
  overlays?: Array<OverlayConfig>;
}

export interface OverlayConfig {
  key: string;
  imageUrl: string;
  nwLon: number;
  nwLat: number;
  neLon: number;
  neLat: number;
  seLon: number;
  seLat: number;
  swLon: number;
  swLat: number;
  opacity: number;
}

export function useMapData(projectId: string) {
  return useQuery({
    queryKey: ["map-data", projectId],
    queryFn: () => api.get<MapData>(`/projects/${projectId}/map-data`),
    enabled: !!projectId,
  });
}
