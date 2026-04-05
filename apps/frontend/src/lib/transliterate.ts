/** Latin → Cyrillic transliteration map */
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", yo: "ё",
  zh: "ж", z: "з", i: "и", y: "й", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", r: "р", s: "с", t: "т", u: "у",
  f: "ф", kh: "х", h: "х", ts: "ц", ch: "ч", sh: "ш", shch: "щ",
  yu: "ю", ya: "я", j: "дж", w: "в", x: "кс", c: "к", q: "к",
};

/** Cyrillic → Latin transliteration map */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Kazakh specific
  ғ: "g", қ: "q", ң: "ng", ү: "u", ұ: "u", һ: "h", і: "i",
  ә: "a", ө: "o",
};

function latinToCyrillic(text: string): string {
  let result = "";
  const lower = text.toLowerCase();
  let i = 0;
  while (i < lower.length) {
    // Try 4-char, 3-char, 2-char, then 1-char sequences
    let matched = false;
    for (const len of [4, 3, 2]) {
      const chunk = lower.slice(i, i + len);
      if (LATIN_TO_CYRILLIC[chunk]) {
        result += LATIN_TO_CYRILLIC[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = lower[i];
      result += LATIN_TO_CYRILLIC[ch] || ch;
      i++;
    }
  }
  return result;
}

function cyrillicToLatin(text: string): string {
  let result = "";
  for (const ch of text.toLowerCase()) {
    result += CYRILLIC_TO_LATIN[ch] || ch;
  }
  return result;
}

function isLatin(text: string): boolean {
  return /[a-zA-Z]/.test(text) && !/[а-яёА-ЯЁ]/.test(text);
}

function isCyrillic(text: string): boolean {
  return /[а-яёА-ЯЁ]/.test(text) && !/[a-zA-Z]/.test(text);
}

/**
 * Generate search variants for a query.
 * If query is Latin → also generate Cyrillic variant.
 * If query is Cyrillic → also generate Latin variant.
 * Returns array of lowercase search strings.
 */
export function getSearchVariants(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const variants = [q];

  if (isLatin(q)) {
    variants.push(latinToCyrillic(q));
  } else if (isCyrillic(q)) {
    variants.push(cyrillicToLatin(q));
  } else {
    // Mixed — try both
    variants.push(latinToCyrillic(q));
    variants.push(cyrillicToLatin(q));
  }

  return [...new Set(variants)];
}

/**
 * Check if a complex name matches the search query (multilingual).
 */
export function matchesSearch(name: string, query: string): boolean {
  if (!query.trim()) return true;
  const nameLower = name.toLowerCase();
  const variants = getSearchVariants(query);
  return variants.some((v) => nameLower.includes(v));
}
