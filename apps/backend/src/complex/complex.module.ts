import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ComplexController } from "./complex.controller";
import { ComplexService } from "./complex.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplexEntity, PropertyEntity]),
    AuthModule,
  ],
  controllers: [ComplexController],
  providers: [ComplexService],
  exports: [ComplexService],
})
export class ComplexModule {}
