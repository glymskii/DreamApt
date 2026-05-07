"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  role: "admin" | "user";
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          const u = JSON.parse(stored);
          // Default role to "user" for old stored sessions that lack the field
          if (!u.role) u.role = "user";
          setUser(u);
        } catch {
          // ignore corrupted localStorage
        }
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
      options: { redirect?: string } = {},
    ): Promise<AuthUser> => {
      const data = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      api.setToken(data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      if (options.redirect) router.push(options.redirect);
      return data.user;
    },
    [router],
  );

  const logout = useCallback(() => {
    api.clearToken();
    localStorage.removeItem("user");
    setUser(null);
    // Stay on current page — site is publicly viewable.
    // If the current route is admin-only, the page will re-render as guest.
  }, []);

  const registerRequest = useCallback(async (email: string): Promise<{ ok: boolean }> => {
    return api.post<{ ok: boolean }>("/auth/register-request", { email });
  }, []);

  const completeRegistration = useCallback(
    async (token: string, password: string): Promise<AuthUser> => {
      const data = await api.post<LoginResponse>("/auth/register-complete", {
        token,
        password,
      });
      api.setToken(data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const checkRegisterToken = useCallback(
    async (token: string): Promise<{ email: string; valid: boolean }> => {
      return api.get(`/auth/register/${encodeURIComponent(token)}`);
    },
    [],
  );

  return {
    user,
    isLoading,
    login,
    logout,
    registerRequest,
    completeRegistration,
    checkRegisterToken,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
  };
}
