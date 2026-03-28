/**
 * Shutov-Tikhonov ratings for residential complexes in Almaty.
 * Source: Yandex Maps constructor map by blogger Shutov-Tikhonov.
 *
 * Categories (0 = best, 5 = worst):
 *   0 — "А ЧТО ТАК МОЖНО БЫЛО" (exemplary)
 *   1 — "ПОЧТИ ИДЕАЛЬНО" (nearly ideal)
 *   2 — "ВЕСЬМА НЕПЛОХО" (quite good)
 *   3 — "ПРОСТО НОРМАЛЬНО" (just okay)
 *   4 — "ПУСТЬ УЖЕ СТОИТ" (bare minimum)
 *   5 — "ЛУЧШЕ БЫ НЕ СТРОИЛИ" (should not have been built)
 */

import ratingsData from "./shutov-ratings.json";

export interface ShutovRating {
  name: string;
  category: number; // 0-5
  categoryLabel: string;
  description: string;
  lat: number;
  lng: number;
}

export const SHUTOV_RATINGS: ShutovRating[] = ratingsData as ShutovRating[];

export const SHUTOV_CATEGORY_LABELS: Record<number, string> = {
  0: "А ЧТО ТАК МОЖНО БЫЛО",
  1: "ПОЧТИ ИДЕАЛЬНО",
  2: "ВЕСЬМА НЕПЛОХО",
  3: "ПРОСТО НОРМАЛЬНО",
  4: "ПУСТЬ УЖЕ СТОИТ",
  5: "ЛУЧШЕ БЫ НЕ СТРОИЛИ",
};

export const SHUTOV_CATEGORY_COLORS: Record<number, string> = {
  0: "#7c3aed", // purple
  1: "#2563eb", // blue
  2: "#16a34a", // green
  3: "#eab308", // yellow
  4: "#f97316", // orange
  5: "#dc2626", // red
};

/**
 * Find a Shutov rating for a given complex name.
 * Uses fuzzy matching: normalizes strings and checks inclusion.
 */
export function findShutovRating(
  complexName: string,
): ShutovRating | undefined {
  if (!complexName) return undefined;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[«»""„'ʼ']/g, "")
      .replace(/жк\s+/gi, "")
      .replace(/[^a-zа-яёәіңғүұқөһ0-9\s]/gi, "")
      .trim();

  const needle = normalize(complexName);
  if (!needle) return undefined;

  // Exact match first
  const exact = SHUTOV_RATINGS.find(
    (r) => normalize(r.name) === needle,
  );
  if (exact) return exact;

  // Needle contained in rating name or vice versa
  const contained = SHUTOV_RATINGS.find((r) => {
    const rn = normalize(r.name);
    return rn.includes(needle) || needle.includes(rn);
  });
  if (contained) return contained;

  // Word-level matching for multi-word names
  const needleWords = needle.split(/\s+/).filter((w) => w.length > 2);
  if (needleWords.length >= 2) {
    const wordMatch = SHUTOV_RATINGS.find((r) => {
      const rn = normalize(r.name);
      return needleWords.every((w) => rn.includes(w));
    });
    if (wordMatch) return wordMatch;
  }

  return undefined;
}
