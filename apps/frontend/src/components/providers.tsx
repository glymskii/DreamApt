"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "./theme-provider";
import { AuthDialogProvider } from "./auth/auth-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: (count, err: any) => {
              // Don't retry 401/403 — caller treats those as guest mode
              if (err?.name === "ApiUnauthorizedError") return false;
              return count < 1;
            },
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthDialogProvider>{children}</AuthDialogProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
