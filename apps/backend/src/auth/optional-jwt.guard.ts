import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

/**
 * Like JwtAuthGuard but never throws — populates request.user when a valid
 * Bearer token is present, leaves it undefined otherwise.
 *
 * Use on endpoints that are public but want to render different data when
 * the caller is logged in (e.g. unlock Shutov rating, properties list).
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const payload = this.jwtService.verify(token);
        request.user = {
          id: payload.sub,
          username: payload.username,
          role: payload.role || "user",
        };
      } catch {
        // Silently ignore invalid tokens — treat as guest
      }
    }
    return true;
  }
}
