import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./entities/user.entity";
import { SearchProjectEntity } from "./entities/search-project.entity";
import { PropertyEntity } from "./entities/property.entity";
import { PropertyGroupEntity } from "./entities/property-group.entity";
import { CJMScenarioEntity } from "./entities/cjm-scenario.entity";
import { WishlistItemEntity } from "./entities/wishlist-item.entity";

const entities = [
  UserEntity,
  SearchProjectEntity,
  PropertyEntity,
  PropertyGroupEntity,
  CJMScenarioEntity,
  WishlistItemEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      url:
        process.env.DATABASE_URL ||
        "postgresql://dreamapt:dreamapt@localhost:5432/dreamapt",
      entities,
      synchronize: true,
      logging: process.env.NODE_ENV === "development",
      ssl: process.env.DATABASE_URL?.includes("neon.tech") ||
           process.env.DATABASE_URL?.includes("supabase") ||
           process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
