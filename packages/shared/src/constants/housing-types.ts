export const ROOM_OPTIONS = [
  { value: 1, label: "1 комната" },
  { value: 2, label: "2 комнаты" },
  { value: 3, label: "3 комнаты" },
  { value: 4, label: "4 комнаты" },
  { value: 5, label: "5+ комнат" },
] as const;

export const BUILDING_TYPES = [
  { value: "new_build", label: "Новостройка" },
  { value: "monolith", label: "Монолит" },
  { value: "brick", label: "Кирпич" },
  { value: "panel", label: "Панель" },
  { value: "any", label: "Не важно" },
] as const;

export const CONDITION_OPTIONS = [
  { value: "euro", label: "Евроремонт" },
  { value: "good", label: "Хорошее" },
  { value: "cosmetic", label: "Косметический ремонт" },
  { value: "raw", label: "Черновая отделка" },
  { value: "any", label: "Не важно" },
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number]["value"];
export type ConditionType = (typeof CONDITION_OPTIONS)[number]["value"];
