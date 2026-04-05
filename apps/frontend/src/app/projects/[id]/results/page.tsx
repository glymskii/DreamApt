"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProperties } from "@/hooks/useProperties";
import { useToggleWishlist } from "@/hooks/useWishlist";
import { useProject, useCreateProject, useUpdateInterview } from "@/hooks/useProjects";
import { useComplexes } from "@/hooks/useComplexes";
import { Header } from "@/components/layout/Header";
import { PropertyCard } from "@/components/property/PropertyCard";
import { ComplexCard } from "@/components/complex/ComplexCard";
import { EditSearchDialog } from "@/components/search/EditSearchDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import {
  ArrowLeft, SortAsc, Loader2, Search, BarChart3, CheckCircle2,
  SlidersHorizontal, Building, List, MapIcon,
} from "lucide-react";

const COMPLEX_SORT_OPTIONS = [
  { value: "scoreTotal", label: "По рейтингу" },
  { value: "priceAvg", label: "По цене" },
  { value: "listingsCount", label: "По объявлениям" },
];

const PROPERTY_SORT_OPTIONS = [
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
  grouping: {
    icon: <Building className="h-6 w-6 animate-pulse text-purple-500" />,
    label: "Группировка по ЖК",
    description: "Объединяем объявления в жилые комплексы...",
    step: 2,
  },
  scoring: {
    icon: <BarChart3 className="h-6 w-6 animate-pulse text-amber-500" />,
    label: "Оценка квартир и ЖК",
    description: "AI анализирует каждый ЖК: инфраструктура, дорога до работы, сейсмика...",
    step: 3,
  },
  scored: {
    icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
    label: "Готово",
    description: "Все ЖК оценены и отсортированы",
    step: 4,
  },
};

function SearchProgress({ status, propertyCount }: { status: string; propertyCount: number }) {
  const info = STATUS_INFO[status] || STATUS_INFO.searching;
  const isActive = status !== "scored";

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8 flex-wrap">
          {[
            { step: 1, label: "Парсинг" },
            { step: 2, label: "Группировка" },
            { step: 3, label: "Оценка" },
            { step: 4, label: "Готово" },
          ].map(({ step, label }) => (
            <div key={step} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
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
                className={`text-xs sm:text-sm ${
                  info.step >= step ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
              {step < 4 && (
                <div
                  className={`w-4 sm:w-8 h-0.5 ${
                    info.step > step ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          {info.icon}
          <h3 className="text-lg font-semibold">{info.label}</h3>
          <p className="text-muted-foreground">{info.description}</p>
        </div>

        {propertyCount > 0 && isActive && (
          <p className="text-sm text-muted-foreground">
            Найдено квартир: {propertyCount}
          </p>
        )}

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
  const [viewMode, setViewMode] = useState<"complexes" | "properties">("complexes");
  const [complexSort, setComplexSort] = useState("scoreTotal");
  const [propertySort, setPropertySort] = useState("scoreTotal");
  const [complexPage, setComplexPage] = useState(1);
  const [propertyPage, setPropertyPage] = useState(1);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: project, refetch: refetchProject } = useProject(projectId);
  const {
    data: complexesData,
    isLoading: complexesLoading,
    refetch: refetchComplexes,
  } = useComplexes(projectId, complexSort, complexPage);
  const {
    data: propertiesData,
    isLoading: propertiesLoading,
    refetch: refetchProperties,
  } = useProperties(projectId, propertySort, propertyPage);
  const { add, remove } = useToggleWishlist();
  const updateInterview = useUpdateInterview(projectId);
  const createProject = useCreateProject();

  const isSearching =
    project?.status === "searching" ||
    project?.status === "scoring" ||
    project?.status === "grouping";

  useEffect(() => {
    if (!isSearching) return;
    const interval = setInterval(() => {
      refetchProject();
      refetchComplexes();
      refetchProperties();
    }, 3000);
    return () => clearInterval(interval);
  }, [isSearching, refetchProject, refetchComplexes, refetchProperties]);

  const handleWishlistToggle = (propertyId: string, wishlisted: boolean) => {
    if (wishlisted) add.mutate(propertyId);
    else remove.mutate(propertyId);
  };

  const handleEditApply = async (answers: Record<string, unknown>, name: string) => {
    const hasResults = (propertiesData?.total || 0) > 0;
    if (!hasResults) {
      await updateInterview.mutateAsync({ answers, name });
      await api.post("/search/start", { projectId });
      refetchProject();
    } else {
      const newProject = await createProject.mutateAsync(name);
      await api.patch(`/projects/${newProject.id}/interview`, { answers, name });
      await api.post("/search/start", { projectId: newProject.id });
      router.push(`/projects/${newProject.id}/results`);
    }
  };

  const sortOptions = viewMode === "complexes" ? COMPLEX_SORT_OPTIONS : PROPERTY_SORT_OPTIONS;
  const currentSort = viewMode === "complexes" ? complexSort : propertySort;
  const setSort = viewMode === "complexes"
    ? (v: string) => { setComplexSort(v); setComplexPage(1); }
    : (v: string) => { setPropertySort(v); setPropertyPage(1); };

  const data = viewMode === "complexes" ? complexesData : propertiesData;
  const isLoading = viewMode === "complexes" ? complexesLoading : propertiesLoading;
  const page = viewMode === "complexes" ? complexPage : propertyPage;
  const setPage = viewMode === "complexes" ? setComplexPage : setPropertyPage;

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
            {!isSearching && (
              <p className="text-sm text-muted-foreground">
                {viewMode === "complexes"
                  ? `${complexesData?.total || 0} жилых комплексов`
                  : `${propertiesData?.total || 0} квартир`}
              </p>
            )}
          </div>
          {!isSearching && (
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/map`)}
                className="hidden sm:flex"
              >
                <MapIcon className="h-4 w-4 mr-1" />
                Карта
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditDialogOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Параметры</span>
              </Button>
            </div>
          )}
        </div>

        {isSearching ? (
          <SearchProgress
            status={project?.status || "searching"}
            propertyCount={project?.propertyCount || 0}
          />
        ) : (
          <>
            {/* View mode toggle + sort */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {/* View toggle */}
              <div className="flex rounded-lg border overflow-hidden mr-2">
                <button
                  className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${
                    viewMode === "complexes"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setViewMode("complexes")}
                >
                  <Building className="h-3.5 w-3.5" />
                  ЖК
                </button>
                <button
                  className={`px-3 py-1.5 text-sm flex items-center gap-1 transition-colors ${
                    viewMode === "properties"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setViewMode("properties")}
                >
                  <List className="h-3.5 w-3.5" />
                  Квартиры
                </button>
              </div>

              {/* Sort */}
              <SortAsc className="h-4 w-4 text-muted-foreground shrink-0" />
              {sortOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={currentSort === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSort(opt.value)}
                  className="shrink-0"
                >
                  {opt.label}
                </Button>
              ))}

              {/* Mobile map button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/map`)}
                className="sm:hidden ml-auto"
              >
                <MapIcon className="h-4 w-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card animate-pulse">
                    <div className="h-44 bg-muted" />
                    <div className="p-4 space-y-3">
                      <div className="h-5 bg-muted rounded w-2/3" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === "complexes" ? (
              // ЖК view
              complexesData && complexesData.complexes.length > 0 ? (
                <>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {complexesData.complexes.map((complex) => (
                      <ComplexCard
                        key={complex.id}
                        complex={complex}
                        onClick={() =>
                          router.push(`/projects/${projectId}/complex/${complex.id}`)
                        }
                      />
                    ))}
                  </div>

                  {complexesData.totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-8">
                      <Button variant="outline" disabled={complexPage <= 1} onClick={() => setComplexPage(complexPage - 1)}>Назад</Button>
                      <span className="flex items-center text-sm text-muted-foreground px-4">
                        {complexPage} из {complexesData.totalPages}
                      </span>
                      <Button variant="outline" disabled={complexPage >= complexesData.totalPages} onClick={() => setComplexPage(complexPage + 1)}>Далее</Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 space-y-4">
                  <p className="text-muted-foreground">
                    ЖК не найдены. Попробуйте расширить параметры поиска.
                  </p>
                  <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Изменить параметры
                  </Button>
                </div>
              )
            ) : (
              // Properties flat view
              propertiesData && propertiesData.properties.length > 0 ? (
                <>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {propertiesData.properties.map((property) => (
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

                  {propertiesData.totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-8">
                      <Button variant="outline" disabled={propertyPage <= 1} onClick={() => setPropertyPage(propertyPage - 1)}>Назад</Button>
                      <span className="flex items-center text-sm text-muted-foreground px-4">
                        {propertyPage} из {propertiesData.totalPages}
                      </span>
                      <Button variant="outline" disabled={propertyPage >= propertiesData.totalPages} onClick={() => setPropertyPage(propertyPage + 1)}>Далее</Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 space-y-4">
                  <p className="text-muted-foreground">
                    Квартиры не найдены. Попробуйте расширить параметры поиска.
                  </p>
                  <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Изменить параметры
                  </Button>
                </div>
              )
            )}
          </>
        )}
      </main>

      <EditSearchDialog
        isOpen={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        initialData={project?.interviewAnswers || null}
        onApply={handleEditApply}
      />
    </div>
  );
}
