"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ConstructionStats {
  underConstruction: number;
  onMap: number;
  withCompletion: number;
  withDeveloper: number;
  pendingDetails: number;
  lastSyncAt: string | null;
  byCompletionYear: Array<{ year: number | null; count: number }>;
}

export interface ImportPageReport {
  page: number;
  since: string;
  cards: number;
  created: number;
  updated: number;
  skippedCompleted: number;
  hasNextPage: boolean;
  lastPage: number | null;
  expired: number | null;
  expirySkipped: boolean;
  newNames: string[];
}

export interface EnrichBatchReport {
  processed: number;
  updated: number;
  failed: number;
  outsideAlmaty: number;
  deleted: number;
  remaining: number;
}

export function useConstructionStats() {
  return useQuery({
    queryKey: ["admin", "construction", "stats"],
    queryFn: () => api.get<ConstructionStats>("/admin/construction/stats"),
    staleTime: 10_000,
  });
}

/** Step-by-step sync calls; the admin tab drives the loops. */
export const constructionSync = {
  importPage: (page: number, since?: string) =>
    api.post<ImportPageReport>(
      `/admin/construction/import-page?page=${page}` +
        (since ? `&since=${encodeURIComponent(since)}` : ""),
    ),
  enrichBatch: (refreshBefore?: string) =>
    api.post<EnrichBatchReport>(
      "/admin/construction/enrich-batch?limit=6" +
        (refreshBefore ? `&refreshBefore=${encodeURIComponent(refreshBefore)}` : ""),
    ),
  preview: (url: string) =>
    api.get<Record<string, unknown>>(
      `/admin/construction/preview?url=${encodeURIComponent(url)}`,
    ),
};
