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
import { Building2, Plus, LogOut, Loader2, List } from "lucide-react";
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

  const handleNewSearch = async () => {
    const project = await createProject.mutateAsync("Новый поиск");
    router.push(`/projects/${project.id}/interview`);
  };

  const handleComplexSelect = (id: string) => {
    setSelectedComplexId(id);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Compact header */}
      <header className="border-b bg-white shrink-0 z-20">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-sm">
              <Building2 className="h-4 w-4" />
              DreamApt
            </Link>
            <span className="text-xs text-muted-foreground hidden sm:block">
              {mapData ? `${mapData.complexes.length} ЖК на карте` : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleNewSearch}
              disabled={createProject.isPending}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Новый поиск
            </Button>
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="h-8 text-xs hidden sm:flex">
                <List className="h-3.5 w-3.5 mr-1" />
                Мои поиски
              </Button>
            </Link>
            {user && (
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-muted-foreground hidden sm:block">{user.username}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content: sidebar + map + slide-over */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left sidebar */}
        {mapData && (
          <MapSidebar
            data={mapData}
            selectedId={selectedComplexId}
            onSelect={handleComplexSelect}
            onHover={setHoveredComplexId}
          />
        )}

        {/* Map */}
        <div className="flex-1 relative">
          {isLoading || !mapData ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Загрузка данных...</p>
              </div>
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

        {/* Slide-over panel */}
        {selectedComplexId && (
          <>
            <div
              className="absolute inset-0 bg-black/20 z-40 lg:hidden"
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
