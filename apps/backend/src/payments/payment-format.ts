/** «4 990 ₸» */
export function formatTenge(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount).replace(/ /g, " ")} ₸`;
}

/** +77071234567 → «+7 707 123 45 67» */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

/** 90 → «3 мес.», 45 → «45 дн.» */
export function formatPeriod(days: number): string {
  return days % 30 === 0 ? `${days / 30} мес.` : `${days} дн.`;
}

/** «17 ноября» in Almaty time. */
export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Almaty" }).format(date);
}
