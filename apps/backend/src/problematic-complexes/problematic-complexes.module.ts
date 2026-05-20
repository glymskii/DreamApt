import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { ProblematicComplexesController } from "./problematic-complexes.controller";
import { ProblematicComplexesService } from "./problematic-complexes.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplexEntity]),
    AuthModule, // AdminGuard
  ],
  controllers: [ProblematicComplexesController],
  providers: [ProblematicComplexesService],
})
export class ProblematicComplexesModule {}
