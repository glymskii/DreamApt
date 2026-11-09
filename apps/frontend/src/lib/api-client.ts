import { getGuestId } from "@/lib/guest-id";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003/api";

export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "ApiUnauthorizedError";
  }
}

/** A non-2xx answer: the server's message, its HTTP status and, when the
 *  server gives one, a machine-readable `code` (e.g. "SEARCH_LIMIT"). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();
    // A guest's own searches are found by this id (see lib/guest-id).
    const guestId = getGuestId();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(guestId ? { "X-Guest-Id": guestId } : {}),
      ...options.headers,
    };

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Token invalid/expired — clear it but don't force redirect.
      // Caller decides how to react (login modal, hide content, etc).
      this.clearToken();
      throw new ApiUnauthorizedError();
    }
    if (res.status === 403) {
      throw new ApiUnauthorizedError();
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: "Request failed" }));
      // Validation errors come back as a list of messages.
      const message = Array.isArray(error.message)
        ? error.message.join(", ")
        : typeof error.message === "string" ? error.message : `HTTP ${res.status}`;
      throw new ApiError(message, res.status, typeof error.code === "string" ? error.code : undefined, error);
    }

    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
