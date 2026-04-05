"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MapData, ResidentialComplex } from "@/hooks/useComplexes";

interface GlobalComplexListResponse {
  complexes: ResidentialComplex[];
  total: number;
  page: number;
  totalPages: number;
}

export function useGlobalMapData() {
  return useQuery({
    queryKey: ["global-map-data"],
    queryFn: () => api.get<MapData>("/complexes/map-data"),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useGlobalComplexes(sort: string = "scoreTotal", page: number = 1) {
  return useQuery({
    queryKey: ["global-complexes", sort, page],
    queryFn: () =>
      api.get<GlobalComplexListResponse>(
        `/complexes/all?sort=${sort}&page=${page}&limit=50`,
      ),
    staleTime: 5 * 60 * 1000,
  });
}
