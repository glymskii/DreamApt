import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateInterviewDto {
  @IsObject()
  answers: Record<string, unknown>;

  @IsOptional()
  @IsString()
  name?: string;
}
