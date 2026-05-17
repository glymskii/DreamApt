import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";
import { JwtAuthGuard } from "./auth.guard";

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

class RegisterRequestDto {
  @IsString()
  phone: string;
}

class RegisterCompleteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Public ──

  // Aggressive limits on auth endpoints. Login: 5/min stops online password
  // brute-force; the global limits would still allow ~100/min. Registration
  // requests: 3/hour per IP — admin's leads dashboard stays usable even
  // under spam.
  @Post("auth/login")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    return this.authService.login(user);
  }

  @Post("auth/register-request")
  @Throttle({ default: { ttl: 60 * 60_000, limit: 3 } })
  async registerRequest(@Body() dto: RegisterRequestDto) {
    return this.authService.createLead(dto.phone);
  }

  @Get("auth/register/:token")
  async checkRegisterToken(@Param("token") token: string) {
    return this.authService.getLeadByToken(token);
  }

  @Post("auth/register-complete")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async registerComplete(@Body() dto: RegisterCompleteDto) {
    return this.authService.completeRegistration(dto.token, dto.password);
  }

  /** Fresh profile lookup — frontend calls this on mount so the locally
   *  cached `user` (with stale searchEnabled/expertEnabled flags) gets
   *  reconciled with the server after an admin grants access. */
  @Get("auth/me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  // ── Admin only ──

  @Get("admin/leads")
  @UseGuards(AdminGuard)
  async listLeads() {
    return { leads: await this.authService.listLeads() };
  }

  @Post("admin/leads/:id/approve")
  @UseGuards(AdminGuard)
  async approveLead(@Param("id") id: string) {
    return this.authService.approveLead(id);
  }

  @Post("admin/leads/:id/reject")
  @UseGuards(AdminGuard)
  async rejectLead(@Param("id") id: string) {
    return this.authService.rejectLead(id);
  }
}
