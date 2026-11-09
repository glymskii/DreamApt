import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

/** Who is looking at a search: a signed-in user, or a guest known only by
 *  the random id their browser keeps (sent as `X-Guest-Id`). */
export interface Viewer {
  userId?: string;
  role?: string;
  guestId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The browser-kept guest id, if the header carries a well-formed one. */
export function parseGuestId(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : undefined;
}

export function viewerOf(req: any): Viewer {
  return { userId: req.user?.id, role: req.user?.role, guestId: req.guestId };
}

/**
 * Search pages are open to guests: lets a request through with a valid JWT
 * or with a guest id, and puts both on the request (`req.user`,
 * `req.guestId`). A bearer token that fails to verify is still a 401, so
 * an expired session is noticed rather than silently becoming a guest.
 */
@Injectable()
export class ViewerGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const payload = this.jwtService.verify(authHeader.split(" ")[1]);
        request.user = {
          id: payload.sub,
          username: payload.username,
          role: payload.role || "user",
        };
      } catch {
        throw new UnauthorizedException();
      }
    }

    const guestId = parseGuestId(request.headers["x-guest-id"]);
    if (guestId) request.guestId = guestId;

    if (!request.user && !request.guestId) throw new UnauthorizedException();
    return true;
  }
}
