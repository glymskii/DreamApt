import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { TelegramModule } from "../telegram/telegram.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { PAYMENT_PROVIDER } from "./providers/payment-provider";
import { KaspiManualProvider } from "./providers/kaspi-manual.provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, UserEntity]),
    AuthModule, // JwtAuthGuard / AdminGuard
    TelegramModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Swap for an API-backed provider once Kaspi approves the integration.
    { provide: PAYMENT_PROVIDER, useClass: KaspiManualProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
