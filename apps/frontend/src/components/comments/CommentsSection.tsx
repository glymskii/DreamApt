"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Trash2, Pencil, X, MessageCircle, Loader2 } from "lucide-react";
import {
  useComments,
  usePostComment,
  useToggleLike,
  useDeleteComment,
  useEditComment,
  COMMENT_EDIT_WINDOW_MS,
  type CommentDTO,
} from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { Button } from "@/components/ui/button";

interface Props {
  complexId: string;
}

/**
 * Threads-style discussion under a ЖК card.
 *
 * Read access: open to everyone (guests can browse comments).
 * Write/like access: gated behind phoneVerified — guests / unverified
 * users see a "Войдите чтобы оставить отзыв" CTA that opens the OTP
 * dialog. Once verified they can post and like instantly.
 *
 * Optimistic-update on like (see useToggleLike) — UI heart flips before
 * the network round-trip completes.
 */
export function CommentsSection({ complexId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const authDialog = useAuthDialog();
  const [sort, setSort] = useState<"new" | "top">("new");
  const [text, setText] = useState("");
  const [postError, setPostError] = useState("");

  const { data, isLoading } = useComments(complexId, sort);
  const postMutation = usePostComment(complexId);
  const likeMutation = useToggleLike(complexId);
  const deleteMutation = useDeleteComment(complexId);
  const editMutation = useEditComment(complexId);

  const isVerified = !!user?.phoneVerified;

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError("");
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await postMutation.mutateAsync(trimmed);
      setText("");
    } catch (err: any) {
      setPostError(err?.message || "Не удалось отправить");
    }
  };

  const handleLike = (commentId: string) => {
    if (!isVerified) {
      authDialog.open("otp", t("comments.gateLike"));
      return;
    }
    likeMutation.mutate(commentId);
  };

  const handleDelete = (commentId: string) => {
    if (!confirm(t("comments.deleteConfirm"))) return;
    deleteMutation.mutate(commentId);
  };

  const comments = data?.comments || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {t("comments.title")}
            {data && data.total > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                · {data.total}
              </span>
            )}
          </span>
        </div>
        {data && data.total > 1 && (
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={() => setSort("new")}
              className={`px-2 py-0.5 rounded ${
                sort === "new"
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("comments.sortNew")}
            </button>
            <button
              onClick={() => setSort("top")}
              className={`px-2 py-0.5 rounded ${
                sort === "top"
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("comments.sortTop")}
            </button>
          </div>
        )}
      </div>

      {/* Composer or login gate */}
      {!user ? (
        <button
          onClick={() => authDialog.open("otp", t("comments.gatePost"))}
          className="w-full text-left p-3 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          {t("comments.gatePost")}
        </button>
      ) : !isVerified ? (
        <button
          onClick={() => authDialog.open("otp", t("comments.gateVerify"))}
          className="w-full text-left p-3 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          {t("comments.gateVerify")}
        </button>
      ) : (
        <form onSubmit={handlePost} className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            placeholder={t("comments.placeholder")}
            className="w-full text-sm p-2 border rounded-md bg-background min-h-[60px] resize-y"
            disabled={postMutation.isPending}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {text.length}/1000
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || postMutation.isPending}
            >
              {postMutation.isPending && (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              )}
              {t("comments.postSubmit")}
            </Button>
          </div>
          {postError && (
            <p className="text-xs text-destructive">{postError}</p>
          )}
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 inline animate-spin mr-1" />
          {t("common.loading")}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {t("comments.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              onLike={() => handleLike(c.id)}
              onDelete={() => handleDelete(c.id)}
              onEdit={(newText) =>
                editMutation.mutateAsync({ commentId: c.id, text: newText })
              }
              isAdmin={user?.role === "admin"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  onLike,
  onDelete,
  onEdit,
  isAdmin,
}: {
  comment: CommentDTO;
  onLike: () => void;
  onDelete: () => void;
  onEdit: (newText: string) => Promise<unknown>;
  isAdmin: boolean;
}) {
  const { t, i18n } = useTranslation();
  const initial = comment.author.displayName.charAt(0).toUpperCase() || "?";
  const isDeleted = !!comment.deletedAt;
  const dateLocale = i18n.language?.startsWith("kk") ? "kk-KZ" : "ru-RU";
  const date = new Date(comment.createdAt).toLocaleString(dateLocale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Re-render once per minute while the comment is still inside its edit
  // window so the button disappears at the boundary without needing a
  // full list refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isDeleted || !comment.isMine) return;
    const ageMs = now - new Date(comment.createdAt).getTime();
    if (ageMs >= COMMENT_EDIT_WINDOW_MS) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [comment.createdAt, comment.isMine, isDeleted, now]);

  const ageMs = now - new Date(comment.createdAt).getTime();
  const canEdit = comment.isMine && !isDeleted && ageMs < COMMENT_EDIT_WINDOW_MS;
  const minutesLeft = canEdit
    ? Math.max(1, Math.ceil((COMMENT_EDIT_WINDOW_MS - ageMs) / 60_000))
    : 0;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditError(t("comments.empty"));
      return;
    }
    if (trimmed === comment.text) {
      setIsEditing(false);
      return;
    }
    setEditError("");
    setIsSaving(true);
    try {
      await onEdit(trimmed);
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.message || t("comments.editFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex gap-2 text-xs">
      <div
        className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center text-[11px] font-semibold"
        title={comment.author.displayName}
      >
        {isDeleted ? "·" : initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold truncate">
            {comment.author.displayName}
          </span>
          {comment.author.isAdmin && (
            <span className="text-[9px] uppercase px-1 rounded bg-primary text-primary-foreground font-bold">
              {t("comments.adminBadge")}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{date}</span>
          {comment.editedAt && !isDeleted && (
            <span className="text-[10px] text-muted-foreground italic">
              · {t("comments.editedTag")}
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              className="w-full text-sm p-2 border rounded-md bg-background min-h-[60px] resize-y"
              disabled={isSaving}
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {draft.length}/1000
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setDraft(comment.text);
                    setEditError("");
                    setIsEditing(false);
                  }}
                  disabled={isSaving}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleSave}
                  disabled={isSaving || !draft.trim()}
                >
                  {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            </div>
            {editError && (
              <p className="text-xs text-destructive">{editError}</p>
            )}
          </div>
        ) : (
          <p
            className={`mt-0.5 leading-snug whitespace-pre-line ${
              isDeleted ? "italic text-muted-foreground" : ""
            }`}
          >
            {isDeleted ? t("comments.deletedPlaceholder") : comment.text}
          </p>
        )}

        {!isDeleted && !isEditing && (
          <div className="flex items-center gap-3 mt-1 text-[11px]">
            <button
              onClick={onLike}
              className={`flex items-center gap-0.5 transition-colors ${
                comment.isLikedByMe
                  ? "text-red-500"
                  : "text-muted-foreground hover:text-red-500"
              }`}
            >
              <Heart
                className="h-3 w-3"
                fill={comment.isLikedByMe ? "currentColor" : "none"}
              />
              {comment.likesCount > 0 && <span>{comment.likesCount}</span>}
            </button>
            {canEdit && (
              <button
                onClick={() => {
                  setDraft(comment.text);
                  setEditError("");
                  setIsEditing(true);
                }}
                className="flex items-center gap-1 text-muted-foreground/70 hover:text-foreground transition-colors"
                title={t("comments.editWindowHint", { minutes: minutesLeft })}
              >
                <Pencil className="h-3 w-3" />
                <span>{t("comments.edit")}</span>
              </button>
            )}
            {(comment.isMine || isAdmin) && (
              <button
                onClick={onDelete}
                className="text-muted-foreground/60 hover:text-destructive transition-colors"
                title={t("comments.delete")}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
