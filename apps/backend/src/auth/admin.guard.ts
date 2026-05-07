import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

/**
 * Combines auth + admin role check. Use on /admin/* endpoints.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }
    const token = authHeader.split(" ")[1];
    try {
      const payload = this.jwtService.verify(token);
      if (payload.role !== "admin") {
        throw new ForbiddenException("Admin access required");
      }
      request.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
      };
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new UnauthorizedException();
    }
  }
}
