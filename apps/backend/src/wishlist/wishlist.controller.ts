import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { WishlistService } from "./wishlist.service";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller("wishlist")
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  @Get()
  async findAll(@Request() req) {
    return this.wishlistService.findByUser(req.user.id);
  }

  @Post()
  async add(@Request() req, @Body() body: { propertyId: string }) {
    return this.wishlistService.add(req.user.id, body.propertyId);
  }

  @Delete(":propertyId")
  async remove(@Request() req, @Param("propertyId") propertyId: string) {
    return this.wishlistService.remove(req.user.id, propertyId);
  }
}
