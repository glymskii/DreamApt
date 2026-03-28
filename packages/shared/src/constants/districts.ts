export const ALMATY_DISTRICTS = [
  { value: "almaly", label: "Алмалинский" },
  { value: "auezov", label: "Ауэзовский" },
  { value: "bostandyk", label: "Бостандыкский" },
  { value: "zhetysu", label: "Жетысуский" },
  { value: "medeu", label: "Медеуский" },
  { value: "nauryzbay", label: "Наурызбайский" },
  { value: "turksib", label: "Турксибский" },
  { value: "alatau", label: "Алатауский" },
] as const;

export type AlmatyDistrict = (typeof ALMATY_DISTRICTS)[number]["value"];
