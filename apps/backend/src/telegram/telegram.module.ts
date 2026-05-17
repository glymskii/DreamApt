import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OtpCodeEntity } from "../database/entities/otp-code.entity";
import { UserEntity } from "../database/entities/user.entity";
import { TelegramService } from "./telegram.service";
import { TelegramController } from "./telegram.controller";
import { OtpService } from "./otp.service";
import { OtpController } from "./otp.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([OtpCodeEntity, UserEntity]),
    // AuthModule re-exports JwtModule — OtpService signs login tokens.
    AuthModule,
  ],
  controllers: [TelegramController, OtpController],
  providers: [TelegramService, OtpService],
  exports: [TelegramService, OtpService],
})
export class TelegramModule {}
