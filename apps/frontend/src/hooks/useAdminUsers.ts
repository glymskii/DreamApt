"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface AdminUserDTO {
  id: string;
  username: string;
  displayName: string | null;
  phone: string | null;
  role: string;
  phoneVerified: boolean;
  searchEnabled: boolean;
  expertEnabled: boolean;
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUserDTO[];
  total: number;
  page: number;
  totalPages: number;
  stats: {
    total: number;
    verified: number;
    searchEnabled: number;
    expertEnabled: number;
  };
}

export type UsersFilter = "all" | "verified" | "search" | "expert" | "admin";

export function useAdminUsers(opts: {
  page?: number;
  limit?: number;
  search?: string;
  filter?: UsersFilter;
}) {
  const page = opts.page || 1;
  const limit = opts.limit || 25;
  const search = (opts.search || "").trim();
  const filter = opts.filter || "all";
  return useQuery({
    queryKey: ["admin", "users", { page, limit, search, filter }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        filter,
      });
      if (search) params.set("search", search);
      return api.get<AdminUsersResponse>(`/admin/users?${params}`);
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
}

export function useUpdateUserFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        searchEnabled?: boolean;
        expertEnabled?: boolean;
        displayName?: string;
      };
    }) => api.patch<AdminUserDTO>(`/admin/users/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
