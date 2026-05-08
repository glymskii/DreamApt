"use client";

import { useTranslation } from "react-i18next";
import { setStoredLocale, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

/**
 * Compact RU↔KK switcher. Click cycles to the next supported locale.
 * Label shows the current language code (RU / KK).
 */
export function LangToggle() {
  const { i18n } = useTranslation();
  const current = (i18n.language?.slice(0, 2) || "ru") as Locale;
  const next: Locale = current === "ru" ? "kk" : "ru";
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs font-medium uppercase"
      onClick={() => setStoredLocale(next)}
      title={`Switch to ${next.toUpperCase()}`}
    >
      <Languages className="h-3.5 w-3.5 mr-1" />
      {current}
    </Button>
  );
}
