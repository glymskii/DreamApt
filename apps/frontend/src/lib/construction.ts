/**
 * Construction stage of a ЖК as synced from Krisha's «Новостройки»
 * catalog (backend ConstructionSyncService).
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface StageFields {
  constructionStatus?: string | null;
  completionYear?: number | null;
  completionQuarter?: number | null;
}

const ROMAN_QUARTERS = ["I", "II", "III", "IV"];

export function isUnderConstruction(c: StageFields | null | undefined): boolean {
  return c?.constructionStatus === "under_construction";
}

/** «III кв. 2026», a bare year when Krisha gives no quarter, or null. */
export function formatCompletion(c: StageFields, t: Translate): string | null {
  if (!c.completionYear) return null;
  const quarter = c.completionQuarter ? ROMAN_QUARTERS[c.completionQuarter - 1] : null;
  if (!quarter) return String(c.completionYear);
  return t("complex.completionQuarter", { quarter, year: c.completionYear });
}

/** Planned completion already behind us: either the project is late or
 *  the developer never updated Krisha. Either way — ask the developer. */
export function isCompletionOverdue(c: StageFields, now = new Date()): boolean {
  if (!c.completionYear) return false;
  const year = now.getFullYear();
  if (c.completionYear !== year) return c.completionYear < year;
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return c.completionQuarter != null && c.completionQuarter < quarter;
}

/** i18n key for the housing class stored by the backend. */
export function housingClassKey(value: string | null | undefined): string | null {
  const keys: Record<string, string> = {
    economy: "complex.classEconomy",
    comfort: "complex.classComfort",
    business: "complex.classBusiness",
    premium: "complex.classPremium",
  };
  return keys[value || ""] || null;
}
