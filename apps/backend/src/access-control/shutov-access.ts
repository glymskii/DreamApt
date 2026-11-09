import type { Repository } from "typeorm";
import type { UserEntity } from "../database/entities/user.entity";

/** Who sees Тихон Шутов's ratings of ЖК: a signed-in user with the Kaspi
 *  subscription running, or one the admin opened them for by hand
 *  (`expertEnabled`), and admins. Guests never do. */
export function hasShutovAccess(
  user: Pick<UserEntity, "role" | "expertEnabled" | "searchPaidUntil"> | null | undefined,
  now = new Date(),
): boolean {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.expertEnabled ||
    (!!user.searchPaidUntil && new Date(user.searchPaidUntil) > now)
  );
}

/** Why a viewer can't see the rating — the UI asks them to sign in or to
 *  subscribe. */
export type ShutovLockReason = "login" | "subscribe";

/** The viewer's lock on the Шутов ratings, or null when they see them.
 *  `viewer` is `req.user` as the auth guards set it. */
export async function shutovLockFor(
  usersRepo: Pick<Repository<UserEntity>, "findOne">,
  viewer: { id?: string; role?: string } | undefined,
): Promise<ShutovLockReason | null> {
  if (!viewer?.id) return "login";
  if (viewer.role === "admin") return null;
  const user = await usersRepo.findOne({ where: { id: viewer.id } });
  return hasShutovAccess(user) ? null : "subscribe";
}

/** A ЖК row without its Шутов category — for every response that isn't
 *  limited to viewers who see the ratings (the public map and card are
 *  edge-cached, so they never carry it). */
export function omitShutov<T extends { shutovCategory?: unknown }>(row: T): Omit<T, "shutovCategory"> {
  const { shutovCategory: _hidden, ...rest } = row;
  return rest;
}
