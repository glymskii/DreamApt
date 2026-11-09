"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Home, Clock, ArrowLeft, LogIn } from "lucide-react";
import { getGuestId } from "@/lib/guest-id";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  interview_complete: { label: "Интервью", variant: "outline" },
  searching: { label: "Поиск...", variant: "default" },
  grouping: { label: "Группировка...", variant: "default" },
  scoring: { label: "Оценка...", variant: "default" },
  scored: { label: "Готово", variant: "default" },
};

export default function ProjectsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const authDialog = useAuthDialog();
  // The search is open to guests: a guest sees the searches made from this
  // browser (by its guest id), an account its own.
  const [guestId, setGuestId] = useState<string | null>(null);
  useEffect(() => setGuestId(getGuestId()), [user]);
  const { data: projects, isLoading } = useProjects(undefined, {
    enabled: !authLoading && (!!user || !!guestId),
  });
  const createProject = useCreateProject();
  const isGuest = !authLoading && !user;

  const handleCreate = async () => {
    const project = await createProject.mutateAsync("Новый поиск");
    router.push(`/projects/${project.id}/interview`);
  };

  const handleClick = (project: { id: string; status: string }) => {
    if (project.status === "draft") {
      router.push(`/projects/${project.id}/interview`);
    } else {
      router.push(`/projects/${project.id}/results`);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Мои поиски</h1>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={createProject.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Новый поиск
          </Button>
        </div>

        {isGuest && (
          <div className="mb-4 -mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>Поиски сохранены в этом браузере. Войдите, чтобы они перешли в ваш аккаунт.</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              onClick={() => authDialog.open("otp")}
            >
              <LogIn className="h-3.5 w-3.5" />
              Войти
            </button>
          </div>
        )}

        {isLoading || authLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="py-4">
                  <div className="h-5 bg-muted rounded w-2/3" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="space-y-3">
            {projects.map((project) => {
              const status = STATUS_LABELS[project.status] || STATUS_LABELS.draft;
              return (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleClick(project)}
                >
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      {project.propertyCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Home className="h-3 w-3" />
                          {project.propertyCount} квартир
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
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
            <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">Пока нет поисков</p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Создать поиск
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
