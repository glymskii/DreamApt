import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { AdminGuard } from "../auth/admin.guard";
import { AdminUsersService } from "./admin-users.service";

class UpdateFlagsDto {
  @IsOptional()
  @IsBoolean()
  searchEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  expertEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}

@Controller("admin/users")
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  async list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("filter") filter?: string,
  ) {
    return this.svc.list({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      search,
      filter: (filter as any) || "all",
    });
  }

  @Patch(":id")
  async updateFlags(@Param("id") id: string, @Body() dto: UpdateFlagsDto) {
    return this.svc.updateFlags(id, dto);
  }
}
