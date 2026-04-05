import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ComplexController } from "./complex.controller";
import { ComplexService } from "./complex.service";
import { KrishaComplexParserService } from "./krisha-complex-parser.service";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { AuthModule } from "../auth/auth.module";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ResidentialComplexEntity, PropertyEntity, SearchProjectEntity]),
    AuthModule,
    forwardRef(() => SearchModule),
  ],
  controllers: [ComplexController],
  providers: [ComplexService, KrishaComplexParserService],
  exports: [ComplexService],
})
export class ComplexModule {}
