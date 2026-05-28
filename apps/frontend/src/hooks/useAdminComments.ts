"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface AdminCommentRow {
  id: string;
  complexId: string;
  complexName: string;
  complexDistrict: string | null;
  text: string | null;
  authorName: string;
  authorPhone: string | null;
  likesCount: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface AdminCommentsResponse {
  total: number;
  active: number;
  deleted: number;
  authors: number;
  recent: AdminCommentRow[];
}

export function useAdminComments(limit = 50) {
  return useQuery({
    queryKey: ["admin", "comments", limit],
    queryFn: () => api.get<AdminCommentsResponse>(`/admin/comments?limit=${limit}`),
    staleTime: 15_000,
  });
}
