"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMapData } from "@/hooks/useComplexes";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function MapPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { data, isLoading } = useMapData(projectId);

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/projects/${projectId}/results`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          К результатам
        </Button>
        <span className="text-sm text-muted-foreground">
          {data ? `${data.complexes.length} ЖК на карте` : "Загрузка..."}
        </span>
      </div>
      <div className="flex-1">
        {isLoading || !data ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MapView
            data={data}
            onComplexClick={(id) =>
              router.push(`/projects/${projectId}/complex/${id}`)
            }
          />
        )}
      </div>
    </div>
  );
}
