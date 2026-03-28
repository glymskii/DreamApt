"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

interface Property {
  id: string;
  krishaUrl: string;
  title: string;
  price: number;
  rooms: number;
  areaTotal: number;
  areaLiving?: number;
  areaKitchen?: number;
  floor: number;
  floorTotal: number;
  buildingType?: string;
  yearBuilt?: number;
  condition?: string;
  district: string;
  address?: string;
  complexName: string;
  lat?: number;
  lng?: number;
  phone?: string;
  photos: string[];
  description?: string;
  scoreTotal: number;
  scoreCommute: number;
  scoreInfrastructure: number;
  scoreLifestyle: number;
  scoreValue?: number;
  commuteMinutes: number;
  commuteTrafficDirection: string;
  scoringExplanation?: string;
  isPrimary: boolean;
  isWishlisted?: boolean;
}

interface PropertiesResponse {
  properties: Property[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NearbyPlaceRef {
  name: string;
  category: string;
  distanceMeters: number;
  address: string;
}

export interface CJMScenario {
  id: string;
  scenarioType: string;
  title: string;
  summary: string;
  detail?: string;
  timeSlot: string;
  tags: string[];
  matchScore: number;
}

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

export interface CJMResponse {
  weekday: CJMScenario[];
  weekend: CJMScenario[];
  nearbyPlaces: NearbyPlaceRef[];
  recommendedProperties: RecommendedProperty[];
}

export function useProperties(projectId: string, sort = "scoreTotal", page = 1) {
  return useQuery({
    queryKey: ["properties", projectId, sort, page],
    queryFn: () =>
      api.get<PropertiesResponse>(
        `/projects/${projectId}/properties?sort=${sort}&page=${page}&limit=20`,
      ),
    enabled: !!projectId,
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ["property", id],
    queryFn: () => api.get<Property>(`/properties/${id}`),
    enabled: !!id,
  });
}

export function useCJM(propertyId: string) {
  return useQuery({
    queryKey: ["cjm", propertyId],
    queryFn: () =>
      api.get<CJMResponse>(
        `/properties/${propertyId}/cjm`,
      ),
    enabled: !!propertyId,
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
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
  officialAnswer?: {
    text: string;
    orgName: string;
    dateCreated: string;
  };
}

interface ReviewsResponse {
  complexName: string;
  totalReviews: number;
  averageRating: number;
  twogisUrl: string | null;
  address: string;
  buildingName: string;
  reviews: ReviewItem[];
}

export function useReviews(propertyId: string) {
  return useQuery({
    queryKey: ["reviews", propertyId],
    queryFn: () => api.get<ReviewsResponse>(`/properties/${propertyId}/reviews`),
    enabled: !!propertyId,
  });
}

export interface ShutovRatingResponse {
  found: boolean;
  name?: string;
  category?: number;
  categoryLabel?: string;
  categoryColor?: string;
  description?: string;
}

export function useShutovRating(propertyId: string) {
  return useQuery({
    queryKey: ["shutov-rating", propertyId],
    queryFn: () =>
      api.get<ShutovRatingResponse>(`/properties/${propertyId}/shutov-rating`),
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });
}

export interface SeismicRiskResponse {
  found: boolean;
  distanceMeters?: number;
  nearestFault?: {
    name: string;
    level: string;
    label: string;
    danger: number;
  };
  riskLevel?: "critical" | "high" | "moderate" | "low" | "safe";
  riskLabel?: string;
  riskColor?: string;
}

export function useSeismicRisk(propertyId: string) {
  return useQuery({
    queryKey: ["seismic-risk", propertyId],
    queryFn: () =>
      api.get<SeismicRiskResponse>(`/properties/${propertyId}/seismic-risk`),
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });
}
