"use client";

import { useRouter } from "next/navigation";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Home, Clock } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "outline" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  interview_complete: { label: "Интервью завершено", variant: "outline" },
  searching: { label: "Поиск...", variant: "warning" },
  scoring: { label: "Оценка...", variant: "warning" },
  scored: { label: "Готово", variant: "success" },
  complete: { label: "Завершён", variant: "success" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();

  const handleCreate = async () => {
    const project = await createProject.mutateAsync("Новый поиск");
    router.push(`/projects/${project.id}/interview`);
  };

  const handleProjectClick = (project: { id: string; status: string }) => {
    if (project.status === "draft") {
      router.push(`/projects/${project.id}/interview`);
    } else {
      router.push(`/projects/${project.id}/results`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Мои поиски</h1>
          <p className="text-muted-foreground mt-1">
            Создайте новый поиск квартиры или просмотрите существующие
          </p>
        </div>
        <Button onClick={handleCreate} disabled={createProject.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Новый поиск
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const status = STATUS_LABELS[project.status] || STATUS_LABELS.draft;
            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => handleProjectClick(project)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                    {project.propertyCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Home className="h-3.5 w-3.5" />
                        {project.propertyCount} квартир
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(project.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Пока нет поисков</h3>
            <p className="text-muted-foreground mb-4">
              Создайте первый поиск, чтобы найти идеальную квартиру
            </p>
            <Button onClick={handleCreate} disabled={createProject.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Создать поиск
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
