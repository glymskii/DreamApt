"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProperties } from "@/hooks/useProperties";
import { useToggleWishlist } from "@/hooks/useWishlist";
import { useProject, useCreateProject, useUpdateInterview } from "@/hooks/useProjects";
import { Header } from "@/components/layout/Header";
import { PropertyCard } from "@/components/property/PropertyCard";
import { EditSearchDialog } from "@/components/search/EditSearchDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { ArrowLeft, SortAsc, Loader2, Search, BarChart3, CheckCircle2, SlidersHorizontal } from "lucide-react";

const SORT_OPTIONS = [
  { value: "scoreTotal", label: "По рейтингу" },
  { value: "price", label: "По цене" },
  { value: "area", label: "По площади" },
];

const STATUS_INFO: Record<string, { icon: React.ReactNode; label: string; description: string; step: number }> = {
  searching: {
    icon: <Search className="h-6 w-6 animate-pulse text-blue-500" />,
    label: "Парсинг Krisha.kz",
    description: "Ищем квартиры по вашим параметрам на Krisha.kz...",
    step: 1,
  },
  scoring: {
    icon: <BarChart3 className="h-6 w-6 animate-pulse text-amber-500" />,
    label: "Оценка квартир",
    description: "AI анализирует каждую квартиру: инфраструктура, дорога до работы, образ жизни...",
    step: 2,
  },
  scored: {
    icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
    label: "Готово",
    description: "Все квартиры оценены и отсортированы",
    step: 3,
  },
};

function SearchProgress({ status, propertyCount }: { status: string; propertyCount: number }) {
  const info = STATUS_INFO[status] || STATUS_INFO.searching;
  const isActive = status === "searching" || status === "scoring";

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="text-center space-y-6">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[
            { step: 1, label: "Парсинг" },
            { step: 2, label: "Оценка" },
            { step: 3, label: "Готово" },
          ].map(({ step, label }) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  info.step > step
                    ? "bg-green-500 text-white"
                    : info.step === step
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {info.step > step ? "\u2713" : step}
              </div>
              <span
                className={`text-sm ${
                  info.step >= step ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {step < 3 && (
                <div
                  className={`w-8 h-0.5 ${
                    info.step > step ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Current status */}
        <div className="flex flex-col items-center gap-3">
          {info.icon}
          <h3 className="text-lg font-semibold">{info.label}</h3>
          <p className="text-muted-foreground">{info.description}</p>
        </div>

        {/* Property count during process */}
        {propertyCount > 0 && isActive && (
          <p className="text-sm text-muted-foreground">
            Найдено квартир: {propertyCount}
          </p>
        )}

        {/* Loading spinner */}
        {isActive && (
          <div className="flex justify-center pt-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [sort, setSort] = useState("scoreTotal");
  const [page, setPage] = useState(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: project, refetch: refetchProject } = useProject(projectId);
  const { data, isLoading, refetch: refetchProperties } = useProperties(projectId, sort, page);
  const { add, remove } = useToggleWishlist();
  const updateInterview = useUpdateInterview(projectId);
  const createProject = useCreateProject();

  const isSearching = project?.status === "searching" || project?.status === "scoring";
  const hasResults = (data?.total || 0) > 0;

  // Auto-refresh while search is in progress
  useEffect(() => {
    if (!isSearching) return;

    const interval = setInterval(() => {
      refetchProject();
      refetchProperties();
    }, 3000);

    return () => clearInterval(interval);
  }, [isSearching, refetchProject, refetchProperties]);

  const handleWishlistToggle = (propertyId: string, wishlisted: boolean) => {
    if (wishlisted) {
      add.mutate(propertyId);
    } else {
      remove.mutate(propertyId);
    }
  };

  const handleEditApply = async (answers: Record<string, unknown>, name: string) => {
    if (!hasResults) {
      // No results → restart current search (update interview and re-search)
      await updateInterview.mutateAsync({ answers, name });
      await api.post("/search/start", { projectId });
      refetchProject();
      refetchProperties();
    } else {
      // Has results → create new project, save answers, start search
      const newProject = await createProject.mutateAsync(name);
      const newUpdateInterview = api.patch<unknown>(`/projects/${newProject.id}/interview`, { answers, name });
      await newUpdateInterview;
      await api.post("/search/start", { projectId: newProject.id });
      router.push(`/projects/${newProject.id}/results`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{project?.name || "Результаты поиска"}</h1>
            {data && !isSearching && (
              <p className="text-sm text-muted-foreground">
                Найдено {data.total} квартир
              </p>
            )}
          </div>
          {/* Edit Search Button */}
          {!isSearching && (
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              className="shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Изменить параметры</span>
              <span className="sm:hidden">Параметры</span>
            </Button>
          )}
        </div>

        {/* Show progress when searching */}
        {isSearching ? (
          <SearchProgress
            status={project?.status || "searching"}
            propertyCount={project?.propertyCount || 0}
          />
        ) : (
          <>
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto">
              <SortAsc className="h-4 w-4 text-muted-foreground shrink-0" />
              {SORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={sort === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSort(opt.value); setPage(1); }}
                  className="shrink-0"
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card animate-pulse">
                    <div className="h-48 bg-muted" />
                    <div className="p-4 space-y-3">
                      <div className="h-5 bg-muted rounded w-2/3" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data && data.properties.length > 0 ? (
              <>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {data.properties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onWishlistToggle={handleWishlistToggle}
                      onClick={() =>
                        router.push(`/projects/${projectId}/property/${property.id}`)
                      }
                    />
                  ))}
                </div>

                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Назад
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground px-4">
                      {page} из {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Далее
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 space-y-4">
                <p className="text-muted-foreground">
                  Квартиры не найдены. Попробуйте расширить параметры поиска.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Изменить параметры
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Edit Search Dialog */}
      <EditSearchDialog
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        initialData={project?.interviewAnswers || null}
        onApply={handleEditApply}
      />
    </div>
  );
}
