/**
 * The search is open without an account: a guest's searches belong to a
 * random id this browser keeps, sent as `X-Guest-Id`. After sign-in the
 * backend moves those searches to the account and the id is dropped.
 */
const KEY = "guestId";

export function getGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The guest id, created on first use (a guest's first search). */
export function ensureGuestId(): string | null {
  const existing = getGuestId();
  if (existing) return existing;
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return null;
  const id = window.crypto.randomUUID();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    return null;
  }
  return id;
}

export function clearGuestId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked — nothing to clear
  }
}
