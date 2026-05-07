import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsEmail, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

class RegisterRequestDto {
  @IsEmail()
  email: string;
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

  @Post("auth/login")
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    return this.authService.login(user);
  }

  @Post("auth/register-request")
  async registerRequest(@Body() dto: RegisterRequestDto) {
    return this.authService.createLead(dto.email);
  }

  @Get("auth/register/:token")
  async checkRegisterToken(@Param("token") token: string) {
    return this.authService.getLeadByToken(token);
  }

  @Post("auth/register-complete")
  async registerComplete(@Body() dto: RegisterCompleteDto) {
    return this.authService.completeRegistration(dto.token, dto.password);
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
