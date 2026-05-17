import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./entities/user.entity";
import { SearchProjectEntity } from "./entities/search-project.entity";
import { PropertyEntity } from "./entities/property.entity";
import { ResidentialComplexEntity } from "./entities/residential-complex.entity";
import { CJMScenarioEntity } from "./entities/cjm-scenario.entity";
import { WishlistItemEntity } from "./entities/wishlist-item.entity";
import { RegistrationLeadEntity } from "./entities/registration-lead.entity";
import { AirQualityReadingEntity } from "./entities/air-quality-reading.entity";
import { RequestStatEntity } from "./entities/request-stat.entity";
import { MapOverlayConfigEntity } from "./entities/map-overlay-config.entity";
import { OtpCodeEntity } from "./entities/otp-code.entity";
import { CommentEntity } from "./entities/comment.entity";
import { CommentLikeEntity } from "./entities/comment-like.entity";
import { AccessRequestEntity } from "./entities/access-request.entity";

const entities = [
  UserEntity,
  SearchProjectEntity,
  PropertyEntity,
  ResidentialComplexEntity,
  CJMScenarioEntity,
  WishlistItemEntity,
  RegistrationLeadEntity,
  AirQualityReadingEntity,
  RequestStatEntity,
  MapOverlayConfigEntity,
  OtpCodeEntity,
  CommentEntity,
  CommentLikeEntity,
  AccessRequestEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      url:
        process.env.DATABASE_URL ||
        "postgresql://dreamapt:dreamapt@localhost:5432/dreamapt",
      entities,
      // synchronize stays on for now: we ship new columns (twogis_reviews_json,
      // twogis_fetched_at) via auto-migrate. Once we have a proper migrations
      // setup, flip this to false in prod and run migrations explicitly.
      // The remaining risk (dropped column on bad refactor) is mitigated by
      // discipline + Render's manual deploy gate.
      synchronize: true,
      logging: process.env.NODE_ENV === "development",
      ssl: process.env.DATABASE_URL?.includes("neon.tech") ||
           process.env.DATABASE_URL?.includes("supabase") ||
           process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
      // Connection pool: default of 10 starves under modest concurrent load
      // (every map-data request holds a connection for ~200ms). 30 buys
      // headroom for ~150 concurrent requests with the cache layer in front.
      // connectionTimeoutMillis prevents requests from hanging on a flaky DB.
      extra: {
        max: parseInt(process.env.DB_POOL_MAX || "30"),
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
