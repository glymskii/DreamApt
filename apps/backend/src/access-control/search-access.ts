import type { UserEntity } from "../database/entities/user.entity";

/** Who may launch the paid search pipeline: admins, users the admin
 *  enabled by hand, and users whose paid period hasn't ended. */
export function hasSearchAccess(
  user: Pick<UserEntity, "role" | "searchEnabled" | "searchPaidUntil">,
  now = new Date(),
): boolean {
  return (
    user.role === "admin" ||
    user.searchEnabled ||
    (!!user.searchPaidUntil && new Date(user.searchPaidUntil) > now)
  );
}
