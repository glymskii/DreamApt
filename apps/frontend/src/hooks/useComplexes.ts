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
  }>;
  airStations?: AirStation[];
  faultLines: Array<{
    name: string;
    level: string;
    label: string;
    danger: number;
    coordinates: [number, number][];
  }>;
}

export function useMapData(projectId: string) {
  return useQuery({
    queryKey: ["map-data", projectId],
    queryFn: () => api.get<MapData>(`/projects/${projectId}/map-data`),
    enabled: !!projectId,
  });
}
