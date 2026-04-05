"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useCreateProject } from "@/hooks/useProjects";
import { useGlobalMapData } from "@/hooks/useGlobalComplexes";
import { MapSidebar } from "@/components/map/MapSidebar";
import { ComplexSlideOver } from "@/components/map/ComplexSlideOver";
import { Button } from "@/components/ui/button";
import { Building2, Plus, LogOut, Loader2, List, Search, X } from "lucide-react";
import Link from "next/link";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Загрузка карты...</p>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const createProject = useCreateProject();
  const { data: mapData, isLoading } = useGlobalMapData();

  const [selectedComplexId, setSelectedComplexId] = useState<string | null>(null);
  const [hoveredComplexId, setHoveredComplexId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const handleNewSearch = async () => {
    const project = await createProject.mutateAsync("Новый поиск");
    router.push(`/projects/${project.id}/interview`);
  };

  const handleComplexSelect = (id: string) => {
    setSelectedComplexId(id);
    setShowMobileSidebar(false);
  };

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* Compact header */}
      <header className="border-b bg-white shrink-0 z-30">
        <div className="flex h-11 sm:h-12 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/dashboard" className="flex items-center gap-1.5 font-semibold text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">DreamApt</span>
            </Link>
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              {mapData ? `${mapData.complexes.length} ЖК` : ""}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mobile: search toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            >
              {showMobileSidebar ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </Button>

            <Button
              size="sm"
              onClick={handleNewSearch}
              disabled={createProject.isPending}
              className="h-8 text-xs px-2 sm:px-3"
            >
              <Plus className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Новый поиск</span>
            </Button>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="h-8 text-xs hidden sm:flex">
                <List className="h-3.5 w-3.5 mr-1" />
                Мои поиски
              </Button>
            </Link>
            {user && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                <LogOut className="h-3.5 w-3.5" />
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
            data={mapData}
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
            <div className="absolute top-0 left-0 bottom-0 w-[300px] bg-white z-40 lg:hidden shadow-xl overflow-y-auto">
              <MapSidebar
                data={mapData}
                selectedId={selectedComplexId}
                onSelect={handleComplexSelect}
                onHover={setHoveredComplexId}
                isMobile
              />
            </div>
          </>
        )}

        {/* Map */}
        <div className="flex-1 relative">
          {isLoading || !mapData ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapView
              data={mapData}
              onComplexClick={handleComplexSelect}
              hoveredComplexId={hoveredComplexId}
              selectedComplexId={selectedComplexId}
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
    </div>
  );
}
