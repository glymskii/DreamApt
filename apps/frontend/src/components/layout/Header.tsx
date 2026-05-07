"use client";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Building2, LogOut } from "lucide-react";
import Link from "next/link";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Building2 className="h-5 w-5" />
          DreamApt
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle size="icon" />
          {user && (
            <>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.username}
              </span>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
