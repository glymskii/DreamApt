"use client";

import { useParams, useRouter } from "next/navigation";
import { useUpdateInterview } from "@/hooks/useProjects";
import { Header } from "@/components/layout/Header";
import { InterviewWizard } from "@/components/interview/InterviewWizard";
import { api } from "@/lib/api-client";

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const updateInterview = useUpdateInterview(projectId);

  const handleComplete = async (answers: Record<string, unknown>, name: string) => {
    await updateInterview.mutateAsync({ answers, name });
    // Trigger search
    await api.post("/search/start", { projectId });
    router.push(`/projects/${projectId}/results`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <InterviewWizard onComplete={handleComplete} />
      </main>
    </div>
  );
}
