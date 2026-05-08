"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import kk from "./locales/kk.json";

export const SUPPORTED_LOCALES = ["ru", "kk"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";
const STORAGE_KEY = "dreamapt-locale";

/** Read stored language; fall back to browser hint, then default. */
export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // ignore
  }
  // Detect from browser
  const nav = (window.navigator.language || "").toLowerCase();
  if (nav.startsWith("kk")) return "kk";
  return DEFAULT_LOCALE;
}

export function setStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  i18n.changeLanguage(locale);
}

// Initialize once on the client. Resources are bundled — no async loading.
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        ru: { translation: ru },
        kk: { translation: kk },
      },
      lng: typeof window === "undefined" ? DEFAULT_LOCALE : getStoredLocale(),
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      // Plural rules: use Russian-style for both ru/kk (close enough for our counts)
      returnNull: false,
    });
}

export { i18n };
export default i18n;
