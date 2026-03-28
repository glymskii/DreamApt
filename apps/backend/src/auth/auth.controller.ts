import { Controller, Post, Body } from "@nestjs/common";
import { IsString } from "class-validator";
import { AuthService } from "./auth.service";

class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    return this.authService.login(user);
  }
}
