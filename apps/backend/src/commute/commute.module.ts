import { Module } from "@nestjs/common";
import { CommuteService } from "./commute.service";

@Module({
  providers: [CommuteService],
  exports: [CommuteService],
})
export class CommuteModule {}
