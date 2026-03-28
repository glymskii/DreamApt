"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      const stored = localStorage.getItem("user");
      if (stored) {
        setUser(JSON.parse(stored));
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api.post<{ accessToken: string; user: User }>(
        "/auth/login",
        { username, password },
      );
      api.setToken(data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      router.push("/dashboard");
    },
    [router],
  );

  const logout = useCallback(() => {
    api.clearToken();
    localStorage.removeItem("user");
    setUser(null);
    router.push("/");
  }, [router]);

  return { user, isLoading, login, logout, isAuthenticated: !!user };
}
