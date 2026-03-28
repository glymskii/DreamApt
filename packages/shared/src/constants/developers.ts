/**
 * Popular Almaty real estate developers and their known residential complexes.
 * Used for include/exclude filtering after Krisha.kz parsing.
 *
 * complexName from Krisha is matched case-insensitively against these patterns.
 */

export interface DeveloperInfo {
  value: string;
  label: string;
  /** Known ЖК names or substrings to match in complexName */
  patterns: string[];
}

export const ALMATY_DEVELOPERS: DeveloperInfo[] = [
  {
    value: "bi_group",
    label: "BI Group",
    patterns: [
      "BI City", "Grand Alatau", "I'Park", "iPark", "BI Park",
      "Holl Park", "Silk Way", "Boulevard", "BI Village",
      "BI Tower", "Green Park", "BI Premium", "Бай Тау",
    ],
  },
  {
    value: "basis",
    label: "Basis / Базис",
    patterns: [
      "Basis", "Базис", "Basis Gold", "Basis Home",
      "Basis Almaty", "Basis Premium",
    ],
  },
  {
    value: "svoydom",
    label: "SvoyDom",
    patterns: [
      "SvoyDom", "Свой Дом", "SvoyDom City", "SvoyDom Park",
      "SvoyDom Premium",
    ],
  },
  {
    value: "rams",
    label: "Rams",
    patterns: [
      "Rams", "Рамс", "Rams City", "Rams Residence",
      "Rams Tower", "Rams Almaty",
    ],
  },
  {
    value: "bazis_a",
    label: "BAZIS-A",
    patterns: [
      "BAZIS-A", "БАЗИС-А", "BAZIS", "Базис-А",
    ],
  },
  {
    value: "alatau_city",
    label: "Alatau City Group",
    patterns: [
      "Alatau City", "Алатау Сити",
    ],
  },
  {
    value: "mg_group",
    label: "MG Group",
    patterns: [
      "MG Group", "МГ Групп",
    ],
  },
  {
    value: "alim_group",
    label: "Alim Group",
    patterns: [
      "Alim", "Алим",
    ],
  },
  {
    value: "ktj",
    label: "КТЖ Строй",
    patterns: [
      "КТЖ",
    ],
  },
  {
    value: "mercury",
    label: "Mercury Properties",
    patterns: [
      "Mercury", "Меркури",
    ],
  },
  {
    value: "exclusive_stroy",
    label: "Exclusive Stroy",
    patterns: [
      "Grande Vie", "Premium Tower", "Exclusive",
    ],
  },
  {
    value: "verny",
    label: "Верный Капитал",
    patterns: [
      "Верный", "Verny",
    ],
  },
  {
    value: "asyl_group",
    label: "Asyl Group",
    patterns: [
      "Asyl", "Асыл",
    ],
  },
];

export type DeveloperKey = (typeof ALMATY_DEVELOPERS)[number]["value"];

export interface DeveloperFilter {
  mode: "include" | "exclude";
  developers: string[];
  /** Custom patterns added by user (ЖК names or developer names) */
  customPatterns: string[];
}
