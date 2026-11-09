import { Controller, Post, Body, Req, UseGuards } from "@nestjs/common";
import { SearchService } from "./search.service";
import { ViewerGuard, viewerOf } from "../auth/viewer.guard";
import { hashClientIp } from "../search-stats/search-stats.service";

/** The search is open to everyone: a signed-in user or a guest id. */
@Controller("search")
@UseGuards(ViewerGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Post("start")
  async startSearch(@Body() body: { projectId: string }, @Req() req: any) {
    // The viewer lets the service check ownership before burning OpenAI
    // credits / hitting Krisha; the address hash counts guests' searches.
    return this.searchService.startSearch(body.projectId, viewerOf(req), hashClientIp(req.ip));
  }
}
