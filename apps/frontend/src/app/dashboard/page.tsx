"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useCreateProject } from "@/hooks/useProjects";
import { useGlobalMapData } from "@/hooks/useGlobalComplexes";
import { useComplexFilters, type MapComplex } from "@/hooks/useComplexFilters";
import { MapSidebar } from "@/components/map/MapSidebar";
import { ComplexSlideOver } from "@/components/map/ComplexSlideOver";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { RequestAccessModal } from "@/components/access/RequestAccessModal";
import { canSearch } from "@/lib/access";
import {
  Building2, Plus, LogOut, Loader2, List, Search, X, LogIn, Shield,
} from "lucide-react";
import Link from "next/link";

const NO_COMPLEXES: MapComplex[] = [];

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isAdmin, logout } = useAuth();
  const authDialog = useAuthDialog();
  const createProject = useCreateProject();
  const { data: mapData, isLoading } = useGlobalMapData();
  // One filter state for the sidebar list (desktop + mobile) and the map.
  const filters = useComplexFilters(mapData?.complexes ?? NO_COMPLEXES);

  const [selectedComplexId, setSelectedComplexId] = useState<string | null>(null);
  const [hoveredComplexId, setHoveredComplexId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [requestSearchOpen, setRequestSearchOpen] = useState(false);

  const handleNewSearch = async () => {
    if (!user) {
      authDialog.open("otp", t("auth.newSearchGate"));
      return;
    }
    // Admins, granted and paying users skip the gate.
    if (!canSearch(user)) {
      setRequestSearchOpen(true);
      return;
    }
    const project = await createProject.mutateAsync(t("header.newSearch"));
    router.push(`/projects/${project.id}/interview`);
  };

  const handleComplexSelect = (id: string) => {
    setSelectedComplexId(id);
    setShowMobileSidebar(false);
  };

  return (
    <div className="public-map-ui h-[100dvh] flex flex-col" onKeyDown={(event) => { if (event.key === "Escape") setShowMobileSidebar(false); }}>
      {/* Compact header */}
      <header className="border-b bg-card shrink-0 z-30">
        <div className="flex h-14 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/dashboard" aria-label={t("header.home")} className="flex min-h-10 items-center gap-1.5 font-semibold text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">DreamApt</span>
            </Link>
            <span className="text-xs text-muted-foreground">
              {mapData
                ? t("map.complexesCount", {
                    count: filters.visibleIds ? filters.filtered.length : mapData.complexes.length,
                  })
                : ""}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mobile: search toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 lg:hidden"
              aria-label={t(showMobileSidebar ? "header.closeList" : "header.openList")}
              aria-expanded={showMobileSidebar}
              aria-controls="mobile-complex-list"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            >
              {showMobileSidebar ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </Button>

            <Button
              size="sm"
              aria-label={t("header.newSearch")}
              onClick={handleNewSearch}
              disabled={createProject.isPending}
              className="h-10 min-w-10 text-xs px-2 sm:px-3"
            >
              <Plus className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t("header.newSearch")}</span>
            </Button>
            {user && (
              <Link href="/projects">
                <Button variant="ghost" size="sm" className="h-10 text-xs hidden sm:flex">
                  <List className="h-3.5 w-3.5 mr-1" />
                  {t("header.mySearches")}
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="h-10 text-xs hidden sm:flex">
                  <Shield className="h-3.5 w-3.5 mr-1" />
                  {t("header.admin")}
                </Button>
              </Link>
            )}
            <LangToggle />
            <ThemeToggle size="icon" />
            {user ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={logout}
                aria-label={t("header.logout")}
                title={t("header.logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-10 min-w-10 text-xs px-2 sm:px-3"
                aria-label={t("header.login")}
                onClick={() => authDialog.open("login")}
              >
                <LogIn className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">{t("header.login")}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop sidebar */}
        {mapData && (
          <MapSidebar
            filters={filters}
            selectedId={selectedComplexId}
            onSelect={handleComplexSelect}
            onHover={setHoveredComplexId}
          />
        )}

        {/* Mobile sidebar overlay */}
        {showMobileSidebar && mapData && (
          <>
            <div
              className="absolute inset-0 bg-black/30 z-30 lg:hidden"
              onClick={() => setShowMobileSidebar(false)}
            />
            <div id="mobile-complex-list" className="absolute inset-0 bg-card z-40 lg:hidden shadow-xl min-h-0">
              <MapSidebar
                filters={filters}
                selectedId={selectedComplexId}
                onSelect={handleComplexSelect}
                onHover={setHoveredComplexId}
                isMobile
              />
            </div>
          </>
        )}

        {/* Map */}
        <div className="min-w-0 flex-1 relative">
          {isLoading || !mapData ? (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapView
              data={mapData}
              onComplexClick={handleComplexSelect}
              hoveredComplexId={hoveredComplexId}
              selectedComplexId={selectedComplexId}
              visibleIds={filters.visibleIds}
              stages={filters.stages}
              onStagesChange={filters.setStages}
            />
          )}
        </div>

        {/* Slide-over / bottom sheet */}
        {selectedComplexId && (
          <>
            <div
              className="absolute inset-0 bg-black/20 z-40"
              onClick={() => setSelectedComplexId(null)}
            />
            <ComplexSlideOver
              complexId={selectedComplexId}
              onClose={() => setSelectedComplexId(null)}
            />
          </>
        )}
      </div>

      <RequestAccessModal
        open={requestSearchOpen}
        onClose={() => setRequestSearchOpen(false)}
        type="search"
        onGranted={handleNewSearch}
      />
    </div>
  );
}
