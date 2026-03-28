export const LIFESTYLE_OPTIONS = [
  { value: "gym", label: "Спортзал / Фитнес", icon: "dumbbell" },
  { value: "running", label: "Бег / Прогулки", icon: "footprints" },
  { value: "parks", label: "Парки и скверы", icon: "trees" },
  { value: "cafes", label: "Кафе и рестораны", icon: "coffee" },
  { value: "schools", label: "Школы / Детсады", icon: "graduation-cap" },
  { value: "universities", label: "Университеты", icon: "book-open" },
  { value: "theaters", label: "Театры / Кино", icon: "clapperboard" },
  { value: "shopping", label: "ТРЦ / Магазины", icon: "shopping-bag" },
  { value: "medical", label: "Клиники / Больницы", icon: "heart-pulse" },
  { value: "parking", label: "Паркинг", icon: "car" },
  { value: "public_transport", label: "Общественный транспорт", icon: "bus" },
  { value: "nightlife", label: "Ночная жизнь", icon: "music" },
] as const;

export type LifestyleOption = (typeof LIFESTYLE_OPTIONS)[number]["value"];

export const COMMUTE_MODES = [
  { value: "car", label: "На машине" },
  { value: "public_transport", label: "Общественный транспорт" },
  { value: "walking", label: "Пешком" },
] as const;

export type CommuteMode = (typeof COMMUTE_MODES)[number]["value"];

export const COMMUTE_TIME_OPTIONS = [
  { value: 15, label: "До 15 минут" },
  { value: 20, label: "До 20 минут" },
  { value: 30, label: "До 30 минут" },
  { value: 45, label: "До 45 минут" },
  { value: 60, label: "До 60 минут" },
] as const;
