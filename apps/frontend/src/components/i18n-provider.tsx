"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n, getStoredLocale } from "@/lib/i18n";

/**
 * Hydration-safe wrapper. SSR renders with default locale (ru) so HTML matches;
 * once mounted on the client we sync to the user's stored / detected locale
 * and only then render children — prevents text flicker.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredLocale();
    if (i18n.language !== stored) {
      i18n.changeLanguage(stored).finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      {/* Render the tree even before locale resync — most strings are already in
          the bundled default language so nothing flashes. */}
      {children}
    </I18nextProvider>
  );
}
