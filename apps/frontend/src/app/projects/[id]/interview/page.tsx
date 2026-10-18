"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUpdateInterview } from "@/hooks/useProjects";
import { Header } from "@/components/layout/Header";
import { InterviewWizard } from "@/components/interview/InterviewWizard";
import { RequestAccessModal } from "@/components/access/RequestAccessModal";
import { api, ApiUnauthorizedError } from "@/lib/api-client";

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const updateInterview = useUpdateInterview(projectId);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const handleComplete = async (answers: Record<string, unknown>, name: string) => {
    await updateInterview.mutateAsync({ answers, name });
    // Trigger search
    try {
      await api.post("/search/start", { projectId });
    } catch (err) {
      // Access ran out since the project was created: the answers are
      // saved, so finishing again after paying starts the search.
      if (err instanceof ApiUnauthorizedError) {
        setPaywallOpen(true);
        return;
      }
      throw err;
    }
    router.push(`/projects/${projectId}/results`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <InterviewWizard onComplete={handleComplete} />
      </main>
      <RequestAccessModal open={paywallOpen} onClose={() => setPaywallOpen(false)} type="search" />
    </div>
  );
}
