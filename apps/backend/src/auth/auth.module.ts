import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./auth.guard";
import { OptionalJwtGuard } from "./optional-jwt.guard";
import { AdminGuard } from "./admin.guard";
import { UserEntity } from "../database/entities/user.entity";
import { RegistrationLeadEntity } from "../database/entities/registration-lead.entity";

/**
 * Resolve and validate the JWT signing secret.
 *
 * In production we hard-fail if it's missing or weak — a known fallback
 * lets anyone forge admin tokens once the source becomes public. In dev
 * we fall back to a fixed string so `pnpm dev` works out of the box.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret) {
      throw new Error(
        "JWT_SECRET env var is required in production. Generate with: " +
          "node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `JWT_SECRET is too short (${secret.length} chars). Minimum 32. ` +
          "Regenerate with crypto.randomBytes(48).",
      );
    }
    if (secret === "dreamapt-dev-secret" || secret === "change-me") {
      throw new Error("JWT_SECRET is set to a known default value. Rotate it.");
    }
  }

  return secret || "dreamapt-dev-secret-do-not-use-in-prod";
}

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RegistrationLeadEntity]),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: process.env.JWT_EXPIRY || "24h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, OptionalJwtGuard, AdminGuard, JwtModule],
})
export class AuthModule {}
