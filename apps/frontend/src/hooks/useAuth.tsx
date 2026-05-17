"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role: "admin" | "user";
  // New per-user flags introduced with the Telegram OTP flow. Optional
  // on the client side so legacy login responses (no flag fields) don't
  // break the shape.
  phoneVerified?: boolean;
  searchEnabled?: boolean;
  expertEnabled?: boolean;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface OtpRequestResponse {
  sessionToken: string;
  telegramDeeplink: string | null;
  botUsername: string | null;
  expiresInSec: number;
}

interface OtpVerifyResponse {
  accessToken: string;
  user: AuthUser;
  isNewUser: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (
    username: string,
    password: string,
    options?: { redirect?: string },
  ) => Promise<AuthUser>;
  logout: () => void;
  registerRequest: (phone: string) => Promise<{ ok: boolean }>;
  completeRegistration: (token: string, password: string) => Promise<AuthUser>;
  checkRegisterToken: (
    token: string,
  ) => Promise<{ phone: string; valid: boolean }>;
  /** Telegram OTP: step 1 — request a code, returns deeplink + bot info. */
  otpRequest: (phone: string) => Promise<OtpRequestResponse>;
  /** Telegram OTP: step 2 — verify code, sets token + logs the user in. */
  otpVerify: (phone: string, code: string) => Promise<OtpVerifyResponse>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Single source of truth for auth state. Wrap the app in <AuthProvider>
 * (already done via <Providers/>) and use useAuth() everywhere.
 *
 * All consumers re-render on login/logout because they read from the same
 * React context — no need for window.location reloads.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          const u = JSON.parse(stored);
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
      // Refresh all queries — guest-mode responses (e.g. shutov: locked)
      // need to refetch with the new auth header to unlock data.
      queryClient.invalidateQueries();
      if (options.redirect) router.push(options.redirect);
      return data.user;
    },
    [router, queryClient],
  );

  const logout = useCallback(() => {
    api.clearToken();
    localStorage.removeItem("user");
    setUser(null);
    // Re-fetch everything as guest
    queryClient.invalidateQueries();
  }, [queryClient]);

  const registerRequest = useCallback(
    async (phone: string): Promise<{ ok: boolean }> => {
      return api.post<{ ok: boolean }>("/auth/register-request", { phone });
    },
    [],
  );

  const completeRegistration = useCallback(
    async (token: string, password: string): Promise<AuthUser> => {
      const data = await api.post<LoginResponse>("/auth/register-complete", {
        token,
        password,
      });
      api.setToken(data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      queryClient.invalidateQueries();
      return data.user;
    },
    [queryClient],
  );

  const checkRegisterToken = useCallback(
    async (token: string): Promise<{ phone: string; valid: boolean }> => {
      return api.get(`/auth/register/${encodeURIComponent(token)}`);
    },
    [],
  );

  /** Step 1 of the Telegram OTP flow. The returned `telegramDeeplink`
   *  is what the user clicks (or scans) to land in the bot — backend has
   *  already created the OTP row tied to the returned `sessionToken`. */
  const otpRequest = useCallback(
    async (phone: string): Promise<OtpRequestResponse> => {
      return api.post<OtpRequestResponse>("/auth/otp/request", { phone });
    },
    [],
  );

  /** Step 2 of the Telegram OTP flow. On success, mirrors `login()` —
   *  stores the JWT, sets the user, refetches queries — so the rest of
   *  the app (header, gated panels) updates immediately. */
  const otpVerify = useCallback(
    async (phone: string, code: string): Promise<OtpVerifyResponse> => {
      const data = await api.post<OtpVerifyResponse>("/auth/otp/verify", {
        phone,
        code,
      });
      api.setToken(data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      queryClient.invalidateQueries();
      return data;
    },
    [queryClient],
  );

  const value: AuthContextValue = {
    user,
    isLoading,
    login,
    logout,
    registerRequest,
    completeRegistration,
    checkRegisterToken,
    otpRequest,
    otpVerify,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
