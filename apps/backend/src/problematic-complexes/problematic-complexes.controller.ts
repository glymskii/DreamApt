import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { AdminGuard } from "../auth/admin.guard";
import { ProblematicComplexesService } from "./problematic-complexes.service";

class ManualEntryDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;
}

@Controller("admin/problematic")
@UseGuards(AdminGuard)
export class ProblematicComplexesController {
  constructor(private readonly svc: ProblematicComplexesService) {}

  /** List of all currently-flagged complexes (matched + stubs). */
  @Get()
  list() {
    return this.svc.listFlagged();
  }

  /** Bulk-apply the bundled akimat snapshot. Idempotent — re-running
   *  does not duplicate stubs or re-flag rows. Returns a structured
   *  report so the admin UI can show what matched / what stubbed. */
  @Post("sync")
  sync() {
    return this.svc.syncFromAkimatList();
  }

  /** Admin manually adds one entry — same fuzzy-match pipeline as the
   *  bulk sync. Used between akimat releases. */
  @Post()
  addManual(@Body() dto: ManualEntryDto) {
    return this.svc.addManualEntry(dto);
  }

  /** Clear the flag. For stubs this deletes the row; for matched real
   *  complexes it only nulls out the problematic_* columns. */
  @Delete(":id")
  unflag(@Param("id") id: string) {
    return this.svc.unflag(id);
  }
}
