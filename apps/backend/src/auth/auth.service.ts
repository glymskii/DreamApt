import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { UserEntity } from "../database/entities/user.entity";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    const existing = await this.usersRepo.findOne({
      where: { username: "admin" },
    });
    if (!existing) {
      const hash = await bcrypt.hash("admin", 10);
      await this.usersRepo.save({
        username: "admin",
        passwordHash: hash,
      });
      console.log("Default admin user created");
    }
  }

  async validateUser(username: string, password: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { username } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }

  async login(user: UserEntity) {
    const payload = { sub: user.id, username: user.username };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
