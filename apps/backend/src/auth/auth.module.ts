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

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RegistrationLeadEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "dreamapt-dev-secret",
      signOptions: { expiresIn: process.env.JWT_EXPIRY || "24h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, OptionalJwtGuard, AdminGuard, JwtModule],
})
export class AuthModule {}
