import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { RequestStatService } from "./request-stat.service";

/**
 * Global interceptor that records traffic stats for every API request.
 * Fires AFTER the response is sent (via rxjs `tap`), so the user-facing
 * latency isn't impacted by the stats write.
 *
 * Skips:
 *   • the stats endpoints themselves (avoid feedback loops in the dashboard)
 *   • health checks (noise — they're called continuously by Render)
 *   • throttler 429 responses that didn't pass routing (no route info)
 */
@Injectable()
export class RequestStatInterceptor implements NestInterceptor {
  constructor(private readonly stats: RequestStatService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      tap({
        next: () => this.tryRecord(req, res),
        error: () => this.tryRecord(req, res),
      }),
    );
  }

  private tryRecord(req: any, res: any) {
    try {
      const url: string = req?.url || req?.originalUrl || "";
      const method: string = (req?.method || "GET").toUpperCase();
      const status: number = res?.statusCode || 200;

      // Skip stats endpoints + health checks to keep the dashboard a real
      // signal instead of self-amplifying noise.
      if (url.includes("/admin/stats")) return;
      if (url === "/api" || url === "/api/" || url === "/api/health") return;

      const pathTemplate = normalizePath(req, url);

      const role = req?.user?.role;
      const userType =
        role === "admin" ? "admin" : role === "user" ? "user" : "guest";

      // Fire-and-forget — service swallows errors. Don't await; we don't
      // want stats to add latency to the user response.
      void this.stats.record({ pathTemplate, method, statusCode: status, userType });
    } catch {
      // ignore — instrumentation must never break the request path.
    }
  }
}

/**
 * Reduce a concrete URL like `/api/complexes/abc-123-uuid` to its route
 * shape `/api/complexes/:id`. Tries Express's matched-route info first
 * (when the request matched a controller), falls back to a regex that
 * replaces UUIDs and pure-digit segments with `:id`/`:n`.
 */
function normalizePath(req: any, url: string): string {
  // Strip query string up front
  const cleanUrl = url.split("?")[0];

  // Express stores the matched route path here after routing — exactly
  // what we want (e.g. "/projects/:projectId/properties").
  const routePath: string | undefined = req?.route?.path;
  if (routePath && typeof routePath === "string") {
    const prefix = req?.baseUrl || "";
    return (prefix + routePath).replace(/\/$/, "") || routePath;
  }

  // Fallback regex normalisation
  return (
    cleanUrl
      .replace(
        /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
        "/:id",
      )
      // UUID-like 24+ hex chars (Mongo-style, just in case)
      .replace(/\/[0-9a-fA-F]{24,}/g, "/:id")
      .replace(/\/\d+/g, "/:n")
      .replace(/\/$/, "") || "/"
  );
}
