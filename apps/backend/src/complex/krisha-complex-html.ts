/**
 * Pure HTML parsers for Krisha's «Новостройки» pages:
 *
 *   • catalog — krisha.kz/complex/search/almaty/ (optionally ?state[]=1,
 *     the «квартиры в строящемся доме» filter)
 *   • ЖК page — krisha.kz/complex/show/almaty/<slug>/
 *
 * No I/O here: KrishaComplexParserService fetches, these functions read.
 * Kept apart so the regexes can be regression-tested against fixture HTML
 * (test/krisha-complex-html.test.ts) without touching the network.
 *
 * Krisha's markup changes without notice, so the construction fields
 * («Срок сдачи», «Застройщик», «Класс жилья», «Этажность») are found by
 * their visible Russian labels rather than by CSS class names: whatever
 * element holds the label, the value is taken from the same text node,
 * the label's children, its next sibling, or the parent's bare text.
 */
import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";

const BASE_URL = "https://krisha.kz";

export const UNDER_CONSTRUCTION = "under_construction";
export const COMPLETED = "completed";
export type ConstructionStatus = typeof UNDER_CONSTRUCTION | typeof COMPLETED;
export type HousingClass = "economy" | "comfort" | "business" | "premium";

export interface Completion {
  year: number;
  quarter: number | null; // 1..4, null when only a year is published
}

export interface CatalogCard {
  krishaComplexId: string;
  name: string;
  krishaUrl: string;
  priceText: string;
  state: string;
  photoUrl: string | null;
  // «Алматы, Медеуский р-н, ул. …» as printed on the card.
  address: string | null;
  district: string | null;
  // What the card itself says. The under-construction import trusts the
  // catalog filter instead, but uses this to skip a card that plainly
  // says «сдан» (filter leak).
  status: ConstructionStatus | null;
  completion: Completion | null;
}

export interface CatalogPage {
  cards: CatalogCard[];
  // Search results found on the page, before validation — 0 means the
  // page has no catalog at all (end of pagination, captcha, or a layout
  // change).
  cardElements: number;
  hasNextPage: boolean;
  // Highest page the paginator links to (null: no paginator).
  lastPage: number | null;
  // <title> + <h1>, used to verify a filter was actually applied.
  heading: string;
}

export interface ComplexDetail {
  lat: number | null;
  lng: number | null;
  address: string | null;
  district: string | null;
  developer: string | null;
  // Floors max and year of completion as found on the ЖК page. Both are
  // nullable since the page format varies and old listings often just
  // don't expose them.
  floorsMax: number | null;
  yearBuilt: number | null;
  status: ConstructionStatus | null;
  completion: Completion | null;
  housingClass: HousingClass | null;
}

// ── Small text helpers ──────────────────────────────────────────────────

function clean(s: string | null | undefined): string {
  // Zero-width spaces turn up inside Krisha addresses («ул. \u200bПриканальная»).
  return (s || "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

/** Text of the element's own text nodes, children excluded. */
function ownText($: CheerioAPI, node: Cheerio<any>): string {
  return clean(
    node
      .contents()
      .toArray()
      .filter((n: any) => n.type === "text")
      .map((n: any) => n.data as string)
      .join(" "),
  );
}

/** Modal value (most common). */
function modal<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = arr[0], bestCount = 0;
  for (const [v, c] of counts) { if (c > bestCount) { best = v; bestCount = c; } }
  return best;
}

// ── Completion date («Срок сдачи») ──────────────────────────────────────

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

// «III квартал 2026 г.», «4 кв. 2026», «2-й квартал 2027 года», «IV-квартал
// 2026». The lookbehind keeps «BI 2 кв» or «12 кв. 2026» from matching
// mid-token.
const QUARTER_RE =
  /(?<![\p{L}\p{N}])(IV|I{1,3}|[1-4])(?:\s*-\s*(?:й|ый|ой|ий))?\s*-?\s*(?:кв\.?|квартал[а-яё]*)\s*(20\d{2})(?!\p{N})/giu;
// «I полугодие 2027» → Q2, «II полугодие 2027» → Q4.
const HALF_RE =
  /(?<![\p{L}\p{N}])(II|I|[12])(?:\s*-\s*(?:е|ое))?\s*-?\s*полугоди[а-яё]*\s*(20\d{2})(?!\p{N})/giu;
const YEAR_RE = /(?<![\p{L}\p{N}])(20\d{2})(?!\p{N})/gu;

/** Roman numerals typed on a Kazakh layout use Cyrillic «І», not Latin «I». */
function latinRoman(text: string): string {
  return text.replace(/[ІӀ]/g, "I");
}

function isPlausibleYear(year: number, now: Date): boolean {
  return year >= 2000 && year <= now.getFullYear() + 10;
}

function quarterOf(token: string): number | null {
  const t = token.toUpperCase();
  if (ROMAN[t]) return ROMAN[t];
  const n = parseInt(t, 10);
  return n >= 1 && n <= 4 ? n : null;
}

/** Quarter / half-year phrases only — specific enough to trust anywhere. */
function quarterCandidates(raw: string, now: Date): Completion[] {
  const text = latinRoman(raw);
  const out: Completion[] = [];
  for (const m of text.matchAll(QUARTER_RE)) {
    const quarter = quarterOf(m[1]);
    const year = parseInt(m[2], 10);
    if (quarter && isPlausibleYear(year, now)) out.push({ year, quarter });
  }
  for (const m of text.matchAll(HALF_RE)) {
    const half = quarterOf(m[1]);
    const year = parseInt(m[2], 10);
    if ((half === 1 || half === 2) && isPlausibleYear(year, now)) {
      out.push({ year, quarter: half * 2 });
    }
  }
  return out;
}

function yearCandidates(text: string, now: Date): Completion[] {
  const out: Completion[] = [];
  for (const m of text.matchAll(YEAR_RE)) {
    const year = parseInt(m[1], 10);
    if (isPlausibleYear(year, now)) out.push({ year, quarter: null });
  }
  return out;
}

/** Latest by (year, quarter); a dated quarter beats a bare year of the same year. */
function latest(list: Completion[]): Completion | null {
  let best: Completion | null = null;
  for (const c of list) {
    if (
      !best ||
      c.year > best.year ||
      (c.year === best.year && (c.quarter ?? 0) > (best.quarter ?? 0))
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Parse a «Срок сдачи» VALUE (already scoped to the label): «III квартал
 * 2026 г.», «2027 г.», or several phases («1 очередь — II кв. 2025,
 * 2 очередь — IV кв. 2026»). Returns the LAST phase — the complex as a
 * whole is finished only then. Null for «Сдан», «уточняется», etc.
 */
export function parseCompletion(text: string | null | undefined, now = new Date()): Completion | null {
  const t = clean(text);
  if (!t) return null;
  return latest([...quarterCandidates(t, now), ...yearCandidates(t, now)]);
}

const DEADLINE_KEYWORD_RE =
  /(?:срок(?:и)?\s+сдачи|сдача|сдан[а-яё]*\s+в|ввод\s+в\s+эксплуатацию)\s*[:—–-]?\s*/giu;

/**
 * Completion date inside free text such as a catalog card. A bare year
 * counts only right after a deadline keyword («Сдача 2027»), so a price
 * or a phone number can't pose as a date; quarter phrases count anywhere.
 */
export function findCompletionInText(text: string | null | undefined, now = new Date()): Completion | null {
  const t = clean(text);
  if (!t) return null;
  const found = quarterCandidates(t, now);
  for (const m of t.matchAll(DEADLINE_KEYWORD_RE)) {
    const start = (m.index ?? 0) + m[0].length;
    const window = t.slice(start, start + 40);
    const year = window.match(/^(20\d{2})(?!\p{N})/u);
    if (year) {
      const y = parseInt(year[1], 10);
      if (isPlausibleYear(y, now)) found.push({ year: y, quarter: null });
    }
  }
  return latest(found);
}

// ── Status / class ──────────────────────────────────────────────────────

/** «Строящийся» / «Строится» → under construction, «Сдан в эксплуатацию» → completed.
 *  «Продажи завершены» says nothing about the building itself → null. */
export function parseConstructionStatus(text: string | null | undefined): ConstructionStatus | null {
  const t = clean(text).toLowerCase().replace(/ё/g, "е");
  if (!t) return null;
  if (/строящ|строится|идет строительство|в процессе строительства/.test(t)) {
    return UNDER_CONSTRUCTION;
  }
  if (/(?<!не\s)(?:сдан|введен в эксплуатацию|построен)/.test(t)) return COMPLETED;
  return null;
}

/**
 * Krisha never moves old ЖК out of «строящийся»: in October 2026 its
 * filter still held ~500 ЖК whose own «Срок сдачи» was 2001–2024. A
 * deadline before last year means the house stands. Last year's and this
 * year's overdue ЖК stay under construction — the ЖК card warns instead.
 */
export function completedLongAgo(completionYear: number | null | undefined, now = new Date()): boolean {
  return completionYear != null && completionYear < now.getFullYear() - 1;
}

export function parseHousingClass(text: string | null | undefined): HousingClass | null {
  const t = clean(text).toLowerCase();
  if (!t) return null;
  if (/премиум|элит|de ?luxe|делюкс|люкс|premium/.test(t)) return "premium";
  if (/бизнес|business/.test(t)) return "business";
  if (/комфорт|comfort/.test(t)) return "comfort";
  if (/эконом|economy/.test(t)) return "economy";
  return null;
}

function parseFloorsValue(text: string): number | null {
  const nums = (text.match(/\d+/g) || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 60);
  return nums.length > 0 ? Math.max(...nums) : null;
}

/** Developer name as shown next to «Застройщик», minus trailing link
 *  noise («Все ЖК застройщика», phone buttons). */
function cleanDeveloper(raw: string): string | null {
  const s = clean(raw)
    .replace(
      /\s*(?:все\s+(?:жк|проекты|объекты|новостройки)|подробнее|сайт\s+застройщика|показать\s+телефон|телефон|\d+\s+(?:жк|проект|объект|новострой)[а-яё]*|\+7[\d\s()-]*).*$/iu,
      "",
    )
    .trim();
  if (s.length < 2 || s.length > 80) return null;
  if (/застройщик|девелопер|не указан|нет данных|неизвест/i.test(s)) return null;
  return s;
}

// ── Label → value extraction ────────────────────────────────────────────

type LabelKey = "completion" | "status" | "housingClass" | "developer" | "floors";

// Anchored at the start of an element's own text; the lookahead stops
// «Застройщикам» / «Классы квартир» from passing for a label.
const LABELS: Record<LabelKey, RegExp> = {
  completion:
    /^(?:плановый\s+)?(?:срок(?:и)?\s+(?:сдачи|ввода)(?:\s+(?:дома|объекта|жк|в\s+эксплуатацию))?|сдача(?:\s+(?:дома|объекта|жк))?|окончание\s+строительства)(?=$|[\s:—–-])/iu,
  status: /^(?:статус|этап|стадия)(?:\s+(?:строительства|объекта|дома|жк))?(?=$|[\s:—–-])/iu,
  housingClass: /^класс(?:\s+(?:жилья|жк|дома|недвижимости))?(?=$|[\s:—–-])/iu,
  developer: /^(?:застройщик|девелопер)(?=$|[\s:—–-])/iu,
  floors: /^(?:этажность|количество\s+этажей)(?=$|[\s:—–-])/iu,
};

const SEP_PREFIX = /^\s*[:—–-]\s*/;

// Label-looking text inside links / menus is SEO navigation
// («Срок сдачи в 2026 году»), never this ЖК's data.
const SKIP_CONTAINERS = "a, nav, footer, script, style, noscript, select, option, button";

/**
 * For every element whose own text starts with one of the labels, the
 * candidate values in order of structural likelihood. Each inner array
 * is one label occurrence (multi-phase projects repeat «Срок сдачи»).
 */
export function collectLabeledValues($: CheerioAPI): Record<LabelKey, string[][]> {
  const out: Record<LabelKey, string[][]> = {
    completion: [], status: [], housingClass: [], developer: [], floors: [],
  };
  $("body *").each((_i, el) => {
    const $el = $(el);
    const own = ownText($, $el);
    if (!own || own.length > 120) return;
    for (const key of Object.keys(LABELS) as LabelKey[]) {
      const m = own.match(LABELS[key]);
      if (!m) continue;
      if ($el.closest(SKIP_CONTAINERS).length > 0) return;

      const rest = own.slice(m[0].length);
      let inline: string | null = null;
      if (SEP_PREFIX.test(rest)) {
        inline = rest.replace(SEP_PREFIX, "");
      } else if (rest.trim()) {
        // «Срок сдачи III кв. 2026» in one text node, no colon. Short
        // tails only — longer ones are sentences, not label/value pairs.
        // A bare year there is too weak to call a deadline.
        const tail = rest.trim();
        if (tail.length > 40) continue;
        if (key === "completion" && quarterCandidates(tail, new Date()).length === 0) continue;
        inline = tail;
      }
      out[key].push(valueCandidates($, $el, inline));
      return;
    }
  });
  return out;
}

function valueCandidates($: CheerioAPI, $el: Cheerio<any>, inline: string | null): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const v = clean(s);
    if (v && v.length <= 300 && !out.includes(v)) out.push(v);
  };
  if (inline) push(inline);
  // Value nested inside the label element: <div>Срок сдачи <b>…</b></div>
  push($el.children().not("script, style").text());
  // Climb while the wrapper holds nothing but the label, then take the
  // first non-empty following sibling — covers <dt>/<dd>, <th>/<td>,
  // label/value spans and <div class="head"><span>label</span></div><div>value</div>.
  const labelText = clean($el.text());
  let node = $el;
  for (let depth = 0; depth < 3 && node.length; depth++) {
    const next = node.nextAll().toArray().find((n) => clean($(n).text()).length > 0);
    if (next) {
      push($(next).text());
      break;
    }
    const parent = node.parent();
    if (!parent.length) break;
    // <li><b>Срок сдачи:</b> III кв. 2026</li> — value is a bare text node.
    const parentOwn = ownText($, parent).replace(SEP_PREFIX, "");
    if (parentOwn) {
      push(parentOwn);
      break;
    }
    if (clean(parent.text()) !== labelText) break;
    node = parent;
  }
  return out;
}

/** Per label occurrence, the first candidate the parser accepts. */
function firstParsed<T>(occurrences: string[][], parse: (s: string) => T | null): T[] {
  const out: T[] = [];
  for (const candidates of occurrences) {
    for (const c of candidates) {
      const v = parse(c);
      if (v !== null) {
        out.push(v);
        break;
      }
    }
  }
  return out;
}

// ── Catalog page ────────────────────────────────────────────────────────

// Link lists that are not search results. Every catalog page ends with
// «Популярные новостройки в Алматы» (.seo-links): ~200 ЖК links, the same
// on every page and NOT narrowed by the search filter.
const NOT_RESULTS = "[class*='seo-'], nav, footer";
const CARD_NAME_PREFIX = /^(?:ЖК|жилой\s+(?:комплекс|квартал)|клубный\s+дом|бигвилль)\s+/iu;

const DISTRICT_RE =
  /(Алмалинский|Ауэзовский|Бостандыкский|Медеуский|Наурызбайский|Турксибский|Жетысуский|Алатауский)\s*(?:р-н|район)/i;

/** «Алматы, Медеуский р-н, ул. …» → «Медеуский р-н». */
function districtOf(text: string | null | undefined): string | null {
  const m = clean(text).match(DISTRICT_RE);
  return m ? `${m[1]} р-н` : null;
}

/** Text of the first match of the first selector that finds non-empty text. */
function textOf($root: Cheerio<any>, ...selectors: string[]): string {
  for (const sel of selectors) {
    const t = clean($root.find(sel).first().text());
    if (t) return t;
  }
  return "";
}

/**
 * One element per search result: the outermost [data-complex-id] outside
 * the link lists. Today that's div.complex-card, whose main link repeats
 * the card's id; should Krisha drop the wrapper, the link takes its place.
 */
function resultRoots($: CheerioAPI): Cheerio<any>[] {
  return $("[data-complex-id]")
    .toArray()
    .filter((el) => {
      const $el = $(el);
      if ($el.closest(NOT_RESULTS).length > 0) return false;
      const id = $el.attr("data-complex-id");
      return !$el
        .parents("[data-complex-id]")
        .toArray()
        .some((p) => $(p).attr("data-complex-id") === id);
    })
    .map((el) => $(el));
}

/** Page a pagination link points to (data-page or ?page=N), 0 if neither. */
function linkedPage($a: Cheerio<any>): number {
  const raw = $a.attr("data-page") || ($a.attr("href") || "").match(/[?&]page=(\d+)/)?.[1] || "";
  const n = parseInt(raw, 10);
  return n > 0 ? n : 0;
}

/** Parse one page of the ЖК catalog (`/complex/search/<city>/`). */
export function parseCatalogPage(html: string, page: number, now = new Date()): CatalogPage {
  const $ = cheerio.load(html);
  const roots = resultRoots($);
  const cards: CatalogCard[] = [];
  const seenIds = new Set<string>();

  for (const $card of roots) {
    const id = $card.attr("data-complex-id");
    if (!id || seenIds.has(id)) continue;

    const $link = $card.is("a") ? $card : $card.find("a[href*='/complex/show/']").first();
    const alias = $card.attr("data-complex-alias"); // "almaty/dreamcityart"
    let href = $link.attr("href") || "";
    if (!href.includes("/complex/show/")) href = alias ? `/complex/show/${alias}/` : "";
    // Developer pages, banners and the like carry the attribute too.
    if (!href) continue;

    const $img = $card.find("img").first();
    const name = clean(
      $card.attr("data-name") ||
        $img.attr("alt") ||
        textOf($card, ".complex-card__title") ||
        href.match(/\/complex\/show\/[^/]+\/([^/?#]+)/)?.[1],
    ).replace(CARD_NAME_PREFIX, "");
    if (!name) continue;
    seenIds.add(id);

    const state = textOf($card, ".complex-card__state");
    const address = textOf($card, ".complex-card__address") || null;
    const src = $img.attr("src") || "";
    cards.push({
      krishaComplexId: id,
      name,
      krishaUrl: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      priceText: textOf($card, ".complex-card__square-price", ".complex-card__price-from", "[class*=price]"),
      state,
      photoUrl: src && !src.startsWith("data:") ? src : null,
      address,
      district: districtOf(address),
      status: parseConstructionStatus(state),
      completion: findCompletionInText(`${state} ${clean($card.text())}`, now),
    });
  }

  // «‹ Предыдущая 1 2 … 52 Дальше ›» — every link carries data-page.
  let pagerLinks = $(".paginator a");
  if (pagerLinks.length === 0) {
    pagerLinks = $("a[href*='page=']").filter((_i, el) => $(el).closest("[class*='seo-']").length === 0);
  }
  const maxLinked = Math.max(0, ...pagerLinks.toArray().map((el) => linkedPage($(el))));

  return {
    cards,
    cardElements: roots.length,
    hasNextPage: maxLinked > page,
    lastPage: maxLinked > 0 ? Math.max(maxLinked, page) : null,
    heading: clean(`${$("title").first().text()} ${$("h1").first().text()}`),
  };
}

// ── ЖК page ─────────────────────────────────────────────────────────────

export interface DetailDebug {
  // Raw label candidates — lets an admin see what the parser read when a
  // field comes back empty on a real page.
  labeled: Record<LabelKey, string[][]>;
}

/** Parse a ЖК page (`/complex/show/<city>/<slug>/`). */
export function parseComplexDetail(html: string, now = new Date()): ComplexDetail & DetailDebug {
  // Extract coordinates from embedded script
  const latMatch = html.match(/"lat":\s*([\d.]+)/);
  const lngMatch = html.match(/"l(?:ng|on)":\s*([\d.]+)/);

  const $ = cheerio.load(html);

  // Extract address
  const addressParts: string[] = [];
  $(".complex-info__address, .complex-about__address").each((_i, el) => {
    const text = $(el).text().trim();
    if (text && !addressParts.includes(text)) addressParts.push(text);
  });

  // Extract floors + year built. Krisha's current ЖК page format embeds
  // building meta inline in apartment listing descriptions, not in any
  // structured `complex-info__*` block. We use two robust patterns:
  //
  //   • Year: "<digits> г.п." (год постройки) e.g. "2028 г.п." appears
  //     in every apartment card's description on a given complex page.
  //     Also support legacy "Сдача дома: ...", "Год постройки: ...".
  //   • Floors: "<digits>/<digits> этаж" e.g. "4/9 этаж" — second number
  //     is the building's total floors. Take max across all matches on
  //     the page so a 25-floor tower with low-apt listings still reports
  //     correctly.

  const ALMATY_YEAR_MIN = 1950;
  const ALMATY_YEAR_MAX = now.getFullYear() + 5; // off-plan completion years

  // Year: scan all "<year> г.п." occurrences, take the modal one.
  const yearMatches = Array.from(html.matchAll(/(\d{4})\s*г\.\s*п\./g))
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y >= ALMATY_YEAR_MIN && y <= ALMATY_YEAR_MAX);
  // Fallback: structured "Сдача дома 2024", "Год постройки 2018" — older templates.
  if (yearMatches.length === 0) {
    const fallback = html.match(/(?:Сдача дома|Сдан в|Год сдачи|Год постройки)[^<]*?(\d{4})/i);
    if (fallback) {
      const y = parseInt(fallback[1], 10);
      if (y >= ALMATY_YEAR_MIN && y <= ALMATY_YEAR_MAX) yearMatches.push(y);
    }
  }
  const yearBuilt = yearMatches.length > 0 ? modal(yearMatches) : null;

  // Floors: scan all "X/Y этаж" patterns, take max Y.
  const floorTotals = Array.from(html.matchAll(/\d+\s*\/\s*(\d+)\s*этаж/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n > 0 && n < 200);

  // Construction fields by label. Off-plan ЖК often have no apartment
  // cards yet, so «Этажность» is the fallback for floors too.
  const labeled = collectLabeledValues($);
  const floorsMax =
    floorTotals.length > 0
      ? Math.max(...floorTotals)
      : firstParsed(labeled.floors, parseFloorsValue)[0] ?? null;

  const developer =
    firstParsed(labeled.developer, cleanDeveloper)[0] ??
    cleanDeveloper($(".complex-info__developer, .developer-name").first().text());

  return {
    lat: latMatch ? parseFloat(latMatch[1]) : null,
    lng: lngMatch ? parseFloat(lngMatch[1]) : null,
    address: addressParts[0] || null,
    district: districtOf(addressParts.join(" ")),
    developer,
    floorsMax,
    yearBuilt,
    status: firstParsed(labeled.status, parseConstructionStatus)[0] ?? null,
    completion: latest(firstParsed(labeled.completion, (s) => parseCompletion(s, now))),
    housingClass: firstParsed(labeled.housingClass, parseHousingClass)[0] ?? null,
    labeled,
  };
}

/** Same thresholds as SearchService.createComplexFromGroup, so ЖК imported
 *  from the catalog show up under the sidebar's floor filter too. */
export function floorSegmentFor(floorsMax: number | null | undefined): string | null {
  if (!floorsMax) return null;
  if (floorsMax <= 5) return "low_rise";
  if (floorsMax <= 12) return "mid_rise";
  if (floorsMax <= 25) return "high_rise";
  return "skyscraper";
}
