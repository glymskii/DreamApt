import { IsNull, type FindOptionsWhere } from "typeorm";
import type { SearchProjectEntity } from "../database/entities/search-project.entity";
import type { Viewer } from "../auth/viewer.guard";

/** Admins see every search; a user sees their own; a guest sees the
 *  searches made under their guest id that no account has claimed yet. */
export function canAccessProject(
  project: Pick<SearchProjectEntity, "userId" | "guestId">,
  viewer: Viewer,
): boolean {
  if (viewer.role === "admin") return true;
  if (viewer.userId && project.userId === viewer.userId) return true;
  return !!viewer.guestId && !project.userId && project.guestId === viewer.guestId;
}

/** `where` for "the searches this viewer owns" (admins included: their own). */
export function ownedProjectsWhere(viewer: Viewer): FindOptionsWhere<SearchProjectEntity>[] {
  const where: FindOptionsWhere<SearchProjectEntity>[] = [];
  if (viewer.userId) where.push({ userId: viewer.userId });
  if (viewer.guestId) where.push({ guestId: viewer.guestId, userId: IsNull() });
  return where;
}
