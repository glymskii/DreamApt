"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

/**
 * Cycles light → dark → system. Icon shows the current preference
 * (not the resolved theme), so users can tell when "system" is on.
 */
export function ThemeToggle({ size = "sm" }: { size?: "sm" | "icon" }) {
  const { theme, toggleTheme, resolvedTheme } = useTheme();

  const icon =
    theme === "light" ? (
      <Sun className="h-4 w-4" />
    ) : theme === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Monitor className="h-4 w-4" />
    );

  const label =
    theme === "light"
      ? "Светлая тема"
      : theme === "dark"
      ? "Тёмная тема"
      : `Системная (${resolvedTheme === "dark" ? "тёмная" : "светлая"})`;

  return (
    <Button
      variant="ghost"
      size={size === "icon" ? "icon" : "sm"}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={size === "icon" ? "h-8 w-8" : "h-8 px-2"}
    >
      {icon}
    </Button>
  );
}
