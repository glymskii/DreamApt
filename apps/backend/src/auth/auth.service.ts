import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { UserEntity } from "../database/entities/user.entity";
import { RegistrationLeadEntity } from "../database/entities/registration-lead.entity";

const BCRYPT_COST = 12;
const TOKEN_TTL_DAYS = 7;
const ADMIN_USERNAME = "admin";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
    @InjectRepository(RegistrationLeadEntity)
    private leadsRepo: Repository<RegistrationLeadEntity>,
    private jwtService: JwtService,
  ) {}

  /**
   * On startup ensure the admin user exists.
   * Password sourced from ADMIN_PASSWORD env var. If env is set and differs from
   * the stored hash, the password is rotated. Logs a clear warning when running
   * with the unsafe default.
   */
  async onModuleInit() {
    const envPassword = process.env.ADMIN_PASSWORD;
    if (!envPassword) {
      this.logger.warn(
        "ADMIN_PASSWORD is NOT set in env — falling back to insecure 'admin'. Set a strong password before going public!",
      );
    }
    const password = envPassword || "admin";

    const existing = await this.usersRepo.findOne({
      where: { username: ADMIN_USERNAME },
    });
    const hash = await bcrypt.hash(password, BCRYPT_COST);

    if (!existing) {
      await this.usersRepo.save({
        username: ADMIN_USERNAME,
        passwordHash: hash,
        role: "admin",
      });
      this.logger.log("Default admin user created");
    } else {
      // Rotate password if env value changed; ensure admin role
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (!matches || existing.role !== "admin") {
        await this.usersRepo.update(existing.id, {
          passwordHash: hash,
          role: "admin",
        });
        this.logger.log("Admin password / role updated from env");
      }
    }
  }

  async validateUser(username: string, password: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({
      where: { username },
    });
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
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Registration leads
  // ─────────────────────────────────────────────────────────

  /** Guest leaves email — creates lead in pending status */
  async createLead(emailRaw: string): Promise<{ ok: true }> {
    const email = (emailRaw || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Некорректный email");
    }
    const existingUser = await this.usersRepo.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException("Пользователь с таким email уже существует");
    }
    const existingLead = await this.leadsRepo.findOne({ where: { email } });
    if (existingLead) {
      // idempotent — don't reveal status to guests, just return ok
      return { ok: true };
    }
    await this.leadsRepo.save({ email, status: "pending" });
    this.logger.log(`Registration lead created: ${email}`);
    return { ok: true };
  }

  async listLeads() {
    return this.leadsRepo.find({ order: { createdAt: "DESC" } });
  }

  async approveLead(id: string): Promise<RegistrationLeadEntity> {
    const lead = await this.leadsRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(
      Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    lead.status = "approved";
    lead.token = token;
    lead.tokenExpiresAt = tokenExpiresAt;
    lead.approvedAt = new Date();
    return this.leadsRepo.save(lead);
  }

  async rejectLead(id: string): Promise<RegistrationLeadEntity> {
    const lead = await this.leadsRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    lead.status = "rejected";
    lead.token = null as any;
    lead.tokenExpiresAt = null as any;
    return this.leadsRepo.save(lead);
  }

  /** Look up a lead by token (used on /auth/register/:token page) */
  async getLeadByToken(token: string): Promise<{ email: string; valid: boolean }> {
    if (!token || token.length < 32) return { email: "", valid: false };
    const lead = await this.leadsRepo.findOne({ where: { token } });
    if (!lead) return { email: "", valid: false };
    if (lead.status !== "approved") return { email: lead.email, valid: false };
    if (lead.tokenExpiresAt && lead.tokenExpiresAt < new Date()) {
      return { email: lead.email, valid: false };
    }
    return { email: lead.email, valid: true };
  }

  /**
   * Complete registration — create user from approved lead.
   * Returns access token (auto-login).
   */
  async completeRegistration(token: string, password: string) {
    if (!token || password.length < 8) {
      throw new BadRequestException("Пароль должен быть минимум 8 символов");
    }
    const lead = await this.leadsRepo.findOne({ where: { token } });
    if (!lead || lead.status !== "approved") {
      throw new UnauthorizedException("Ссылка не действительна");
    }
    if (lead.tokenExpiresAt && lead.tokenExpiresAt < new Date()) {
      throw new UnauthorizedException("Срок действия ссылки истёк");
    }

    // Build a username from email — simple, can be edited later
    const baseUsername = lead.email.split("@")[0].replace(/[^a-z0-9_-]/gi, "");
    let username = baseUsername;
    let suffix = 0;
    while (await this.usersRepo.findOne({ where: { username } })) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.usersRepo.save({
      username,
      email: lead.email,
      passwordHash: hash,
      role: "user",
    });

    lead.status = "completed";
    lead.token = null as any;
    lead.tokenExpiresAt = null as any;
    lead.completedAt = new Date();
    await this.leadsRepo.save(lead);

    return this.login(user);
  }
}
