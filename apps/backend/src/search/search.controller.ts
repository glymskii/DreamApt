import { Controller, Post, Body, Req, UseGuards } from "@nestjs/common";
import { SearchService } from "./search.service";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller("search")
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Post("start")
  async startSearch(@Body() body: { projectId: string }, @Req() req: any) {
    // Pass user id so the service can enforce project ownership before
    // burning OpenAI credits / hitting Krisha on a project the caller doesn't own.
    return this.searchService.startSearch(body.projectId, req.user?.id);
  }
}
