"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ProblematicDTO {
  id: string;
  name: string;
  displayName: string | null;
  address: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  isStub: boolean;
  problematicSourceName: string | null;
  problematicAddress: string | null;
  problematicReason: string | null;
  problematicSourceUrl: string | null;
  problematicUpdatedAt: string | null;
}

export interface SyncReport {
  total: number;
  matched: number;
  alreadyFlagged: number;
  stubsCreated: number;
  failures: Array<{ name: string; reason: string }>;
  matches: Array<{
    source: string;
    matchedTo: string | null;
    matchType: "exact" | "fuzzy" | "stub";
    complexId: string;
  }>;
}

export function useProblematicList() {
  return useQuery({
    queryKey: ["admin", "problematic"],
    queryFn: () => api.get<ProblematicDTO[]>("/admin/problematic"),
    staleTime: 10_000,
  });
}

export function useSyncAkimatList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SyncReport>("/admin/problematic/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "problematic"] });
      // Map data + global list contain isProblematic — refresh them
      // so the new red markers appear without a hard reload.
      qc.invalidateQueries({ queryKey: ["global-map-data"] });
      qc.invalidateQueries({ queryKey: ["global-complexes"] });
    },
  });
}

export function useAddProblematicManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      district?: string;
      address?: string;
      reason?: string;
      sourceUrl?: string;
    }) => api.post<ProblematicDTO>("/admin/problematic", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "problematic"] });
      qc.invalidateQueries({ queryKey: ["global-map-data"] });
      qc.invalidateQueries({ queryKey: ["global-complexes"] });
    },
  });
}

export function useUnflagProblematic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ deleted: boolean }>(`/admin/problematic/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "problematic"] });
      qc.invalidateQueries({ queryKey: ["global-map-data"] });
      qc.invalidateQueries({ queryKey: ["global-complexes"] });
    },
  });
}
