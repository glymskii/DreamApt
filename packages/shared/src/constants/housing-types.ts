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

export const FLOOR_SEGMENTS = [
  { value: "low_rise", label: "Малоэтажный (1-5)", icon: "🏠", maxFloor: 5, description: "Клубные дома, таунхаусы" },
  { value: "mid_rise", label: "Среднеэтажный (6-12)", icon: "🏢", maxFloor: 12, description: "Комфортная застройка" },
  { value: "high_rise", label: "Высотный (13-25)", icon: "🏙️", maxFloor: 25, description: "Стандартные новостройки" },
  { value: "skyscraper", label: "Сверхвысотный (25+)", icon: "🏗️", maxFloor: 999, description: "Небоскрёбы, бизнес-класс" },
] as const;

export type FloorSegment = (typeof FLOOR_SEGMENTS)[number]["value"];
export type BuildingType = (typeof BUILDING_TYPES)[number]["value"];
export type ConditionType = (typeof CONDITION_OPTIONS)[number]["value"];
