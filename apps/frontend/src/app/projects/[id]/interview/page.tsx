"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUpdateInterview } from "@/hooks/useProjects";
import { Header } from "@/components/layout/Header";
import { InterviewWizard } from "@/components/interview/InterviewWizard";
import { SearchStartError } from "@/components/search/SearchStartError";
import { api } from "@/lib/api-client";

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const updateInterview = useUpdateInterview(projectId);
  const [startError, setStartError] = useState<unknown>(null);

  const handleComplete = async (answers: Record<string, unknown>, name: string) => {
    setStartError(null);
    await updateInterview.mutateAsync({ answers, name });
    // Trigger search — open to everyone, within a daily limit.
    try {
      await api.post("/search/start", { projectId });
    } catch (err) {
      // The answers are saved: finishing again (e.g. after signing in, or
      // once the server is free) starts the search.
      setStartError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.push(`/projects/${projectId}/results`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <SearchStartError error={startError} />
        <InterviewWizard onComplete={handleComplete} />
      </main>
    </div>
  );
}
