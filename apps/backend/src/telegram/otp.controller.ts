import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, Length } from "class-validator";
import { OtpService } from "./otp.service";

class OtpRequestDto {
  @IsString()
  phone: string;
}

class OtpVerifyDto {
  @IsString()
  phone: string;

  @IsString()
  @Length(4, 8)
  code: string;
}

/**
 * Telegram-OTP register + login. Routes live under /auth/otp/* so the
 * frontend client doesn't need to know there's a separate module — to
 * callers it's all "auth". Lives in TelegramModule (not AuthModule) to
 * avoid a circular dep (TelegramModule already imports AuthModule for
 * its JwtModule).
 */
@Controller("auth/otp")
export class OtpController {
  constructor(private otp: OtpService) {}

  /**
   * Step 1: user enters phone → we generate code + session token,
   * return the t.me deeplink the user must open to receive the code.
   * Rate-limited at 5/min per IP (OtpService also enforces 3/min per
   * phone — both layers must pass).
   */
  @Post("request")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async request(@Body() dto: OtpRequestDto) {
    return this.otp.requestOtp(dto.phone);
  }

  /**
   * Step 2: user types the 6-digit code → we verify, then create or
   * log in the user and return a JWT. Rate-limited at 10/min per IP
   * (OtpService also caps per-row attempts at 5).
   */
  @Post("verify")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verify(@Body() dto: OtpVerifyDto) {
    return this.otp.verifyOtp(dto.phone, dto.code);
  }
}
