import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommentEntity } from "../database/entities/comment.entity";
import { CommentLikeEntity } from "../database/entities/comment-like.entity";
import { UserEntity } from "../database/entities/user.entity";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommentEntity,
      CommentLikeEntity,
      UserEntity,
      ResidentialComplexEntity, // admin moderation view joins ЖК names
    ]),
    AuthModule, // JwtAuthGuard + OptionalJwtGuard + AdminGuard
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
