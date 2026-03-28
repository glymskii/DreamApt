import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { SearchService } from "./search.service";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller("search")
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Post("start")
  async startSearch(@Body() body: { projectId: string }) {
    return this.searchService.startSearch(body.projectId);
  }
}
