"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n, getStoredLocale } from "@/lib/i18n";

/**
 * Hydration-safe wrapper. SSR renders with default locale (ru) so HTML matches;
 * once mounted on the client we sync to the user's stored / detected locale.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const updateDocumentLanguage = (language: string) => {
      document.documentElement.lang = language;
    };
    i18n.on("languageChanged", updateDocumentLanguage);
    void i18n.changeLanguage(getStoredLocale());
    updateDocumentLanguage(i18n.language);
    return () => { i18n.off("languageChanged", updateDocumentLanguage); };
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
