"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type AccessRequestType = "search" | "expert";
export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequestDTO {
  id: string;
  userId: string;
  type: AccessRequestType;
  status: AccessRequestStatus;
  message: string | null;
  createdAt: string;
  processedAt: string | null;
  user: {
    id: string;
    displayName: string;
    phone: string;
    phoneVerified: boolean;
    searchEnabled: boolean;
    expertEnabled: boolean;
    role: string;
  };
}

/** Current user's own access requests — drives the "уже подали" UI state. */
export function useMyAccessRequests(enabled: boolean = true) {
  return useQuery({
    queryKey: ["access-requests", "mine"],
    queryFn: () => api.get<AccessRequestDTO[]>("/access-requests/mine"),
    enabled,
    staleTime: 30_000,
  });
}

export function useSubmitAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: AccessRequestType; message?: string }) =>
      api.post<AccessRequestDTO>("/access-requests", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-requests", "mine"] });
    },
  });
}

// ── Admin ──

export function useAdminAccessRequests(
  filter: { status?: AccessRequestStatus | "all"; type?: AccessRequestType | "all" } = {},
) {
  const status = filter.status || "pending";
  const type = filter.type || "all";
  return useQuery({
    queryKey: ["admin", "access-requests", status, type],
    queryFn: () =>
      api.get<AccessRequestDTO[]>(
        `/admin/access-requests?status=${status}&type=${type}`,
      ),
    staleTime: 10_000,
  });
}

export function useApproveAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.post<AccessRequestDTO>(`/admin/access-requests/${id}/approve`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "access-requests"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useRejectAccessRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.post<AccessRequestDTO>(`/admin/access-requests/${id}/reject`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "access-requests"] });
    },
  });
}
