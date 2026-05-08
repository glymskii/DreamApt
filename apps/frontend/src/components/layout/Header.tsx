"use client";

import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { Building2, LogOut, LogIn, Shield } from "lucide-react";
import Link from "next/link";

export function Header() {
  const { t } = useTranslation();
  const { user, isAdmin, logout } = useAuth();
  const authDialog = useAuthDialog();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Building2 className="h-5 w-5" />
          DreamApt
        </Link>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                <Shield className="h-3.5 w-3.5 mr-1" />
                {t("header.admin")}
              </Button>
            </Link>
          )}
          <LangToggle />
          <ThemeToggle size="icon" />
          {user ? (
            <>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.username}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title={t("header.logout")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => authDialog.open("login")}
            >
              <LogIn className="h-3.5 w-3.5 mr-1" />
              {t("header.login")}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
