/**
 * Construction stage of a ЖК as synced from Krisha's «Новостройки»
 * catalog (backend ConstructionSyncService).
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface StageFields {
  constructionStatus?: string | null;
  completionYear?: number | null;
  completionQuarter?: number | null;
  yearBuilt?: number | null;
}

/** Map/list stage filters; several selected = any of them. */
export type Stage = "building" | "new";

// «Новостройка» = finished within this many years (this one included).
const NEW_BUILDING_YEARS = 3;

const ROMAN_QUARTERS = ["I", "II", "III", "IV"];

export function isUnderConstruction(c: StageFields | null | undefined): boolean {
  return c?.constructionStatus === "under_construction";
}

/** Year the ЖК (its latest phase) was finished: the later of the listings'
 *  «г.п.» and Krisha's deadline, ignoring years still ahead. */
export function completedYear(c: StageFields, now = new Date()): number | null {
  const thisYear = now.getFullYear();
  const years = [c.yearBuilt, c.completionYear].filter(
    (y): y is number => y != null && y > 0 && y <= thisYear,
  );
  return years.length > 0 ? Math.max(...years) : null;
}

/** First year that still counts as «новостройка». */
export function newBuildingSince(now = new Date()): number {
  return now.getFullYear() - NEW_BUILDING_YEARS;
}

/** Finished recently. ЖК under construction have their own filter. */
export function isNewBuilding(c: StageFields | null | undefined, now = new Date()): boolean {
  if (!c || isUnderConstruction(c)) return false;
  const year = completedYear(c, now);
  return year != null && year >= newBuildingSince(now);
}

export function matchesStages(c: StageFields, stages: readonly Stage[]): boolean {
  return (
    (stages.includes("building") && isUnderConstruction(c)) ||
    (stages.includes("new") && isNewBuilding(c))
  );
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
