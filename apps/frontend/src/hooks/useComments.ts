import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface CommentDTO {
  id: string;
  text: string;
  likesCount: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  parentId: string | null;
  author: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  };
  isLikedByMe: boolean;
  isMine: boolean;
}

interface CommentsPage {
  comments: CommentDTO[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Comments list for a residential complex. Cached for 10s; mutations
 * (post / like / delete) invalidate on success so the UI never shows
 * a stale state on the same client.
 */
export function useComments(complexId: string, sort: "new" | "top" = "new") {
  return useQuery({
    queryKey: ["comments", complexId, sort],
    queryFn: () =>
      api.get<CommentsPage>(`/complexes/${complexId}/comments?sort=${sort}&limit=50`),
    enabled: !!complexId,
    staleTime: 10_000,
  });
}

export function usePostComment(complexId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api.post<CommentDTO>(`/complexes/${complexId}/comments`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", complexId] });
    },
  });
}

export function useToggleLike(complexId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.post<{ likesCount: number; isLikedByMe: boolean }>(
        `/comments/${commentId}/like`,
      ),
    // Optimistic update — flip the heart immediately, roll back if the
    // request fails so the user doesn't see a perceptible delay on tap.
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: ["comments", complexId] });
      const snapshots = qc.getQueriesData<CommentsPage>({
        queryKey: ["comments", complexId],
      });
      qc.setQueriesData<CommentsPage>(
        { queryKey: ["comments", complexId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            comments: old.comments.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    isLikedByMe: !c.isLikedByMe,
                    likesCount: c.likesCount + (c.isLikedByMe ? -1 : 1),
                  }
                : c,
            ),
          };
        },
      );
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["comments", complexId] });
    },
  });
}

export function useDeleteComment(complexId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete<{ ok: true }>(`/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", complexId] });
    },
  });
}

/** Server enforces ownership + 10-min editing window; client uses the
 *  same constant to hide the button once the window has elapsed. */
export const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

export function useEditComment(complexId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      api.patch<CommentDTO>(`/comments/${commentId}`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", complexId] });
    },
  });
}
