import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommentEntity } from "../database/entities/comment.entity";
import { CommentLikeEntity } from "../database/entities/comment-like.entity";
import { UserEntity } from "../database/entities/user.entity";
import { CommentsService } from "./comments.service";
import { CommentsController } from "./comments.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CommentEntity, CommentLikeEntity, UserEntity]),
    AuthModule, // JwtAuthGuard + OptionalJwtGuard
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
