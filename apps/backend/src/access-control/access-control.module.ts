import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccessRequestEntity } from "../database/entities/access-request.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AccessRequestsService } from "./access-requests.service";
import { AccessRequestsController } from "./access-requests.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminUsersController } from "./admin-users.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessRequestEntity, UserEntity]),
    AuthModule, // for JwtAuthGuard / AdminGuard
  ],
  controllers: [AccessRequestsController, AdminUsersController],
  providers: [AccessRequestsService, AdminUsersService],
  exports: [AccessRequestsService, AdminUsersService],
})
export class AccessControlModule {}
