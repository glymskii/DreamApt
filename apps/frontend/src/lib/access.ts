import type { AuthUser } from "@/hooks/useAuth";

/** Mirrors the backend's hasSearchAccess; the server re-checks on launch. */
export function canSearch(user: AuthUser | null | undefined, now = Date.now()): boolean {
  if (!user) return false;
  return (
    user.role === "admin" ||
    !!user.searchEnabled ||
    (!!user.searchPaidUntil && Date.parse(user.searchPaidUntil) > now)
  );
}

/** «3 000 ₸» */
export function formatTenge(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} ₸`;
}

/** Whole months read as months: 90 → 3. */
export const periodMonths = (days: number): number | null => (days % 30 === 0 ? days / 30 : null);

/** Admin wording: 90 → «3 мес.», 45 → «45 дн.» */
export function formatPeriodShort(days: number): string {
  const months = periodMonths(days);
  return months ? `${months} мес.` : `${days} дн.`;
}

/** «17 ноября» on Almaty's calendar. */
export function formatAccessDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale.startsWith("kk") ? "kk-KZ" : "ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Almaty",
  });
}
