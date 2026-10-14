"use client";

import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

/**
 * Cycles light → dark → system. Icon shows the current preference
 * (not the resolved theme), so users can tell when "system" is on.
 */
export function ThemeToggle({ size = "sm" }: { size?: "sm" | "icon" }) {
  const { t } = useTranslation();
  const { theme, toggleTheme, resolvedTheme } = useTheme();

  const icon =
    theme === "light" ? (
      <Sun className="h-4 w-4" />
    ) : theme === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Monitor className="h-4 w-4" />
    );

  const label = t(`theme.${theme}`, { resolved: t(`theme.${resolvedTheme}`) });

  return (
    <Button
      variant="ghost"
      size={size === "icon" ? "icon" : "sm"}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={size === "icon" ? "h-10 w-10" : "h-10 min-w-10 px-2"}
    >
      {icon}
    </Button>
  );
}
