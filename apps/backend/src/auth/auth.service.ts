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

  /**
   * Authenticate by either username or phone number.
   * - Phone-like input (digits + optional +) is normalized and matched against
   *   user.phone or user.username.
   * - Otherwise treated as a plain username (e.g. admin).
   */
  async validateUser(identifier: string, password: string): Promise<UserEntity> {
    const trimmed = (identifier || "").trim();
    let user: UserEntity | null = null;

    // Try phone match first if it looks like a number
    if (/[\d+\s()-]{6,}/.test(trimmed) && !/^[a-z]/i.test(trimmed)) {
      const normalized = this.normalizeKzPhone(trimmed);
      if (normalized) {
        user = await this.usersRepo.findOne({ where: { phone: normalized } });
      }
    }

    // Fallback to username match
    if (!user) {
      user = await this.usersRepo.findOne({ where: { username: trimmed } });
    }

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
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  //  Registration leads
  // ─────────────────────────────────────────────────────────

  /**
   * Normalize a Kazakhstani phone number to E.164 form (+77XXXXXXXXX).
   * Accepts "+7 707 123 45 67", "8 707 123 45 67", "+77071234567" etc.
   * Returns null if the input doesn't look like a valid KZ mobile number.
   */
  private normalizeKzPhone(raw: string): string | null {
    if (!raw) return null;
    // Strip everything except digits
    const digits = raw.replace(/\D+/g, "");
    let normalized: string | null = null;

    if (digits.length === 11 && digits.startsWith("7")) {
      normalized = "+" + digits;
    } else if (digits.length === 11 && digits.startsWith("8")) {
      normalized = "+7" + digits.slice(1);
    } else if (digits.length === 10 && digits.startsWith("7")) {
      // user typed +7 then 10-digit body without country code? unlikely — skip
      normalized = "+7" + digits;
    } else {
      return null;
    }

    // KZ mobile carrier prefixes — second digit after +7 is 7 (mobile),
    // optional but enforces realistic numbers.
    if (!/^\+77\d{9}$/.test(normalized)) return null;
    return normalized;
  }

  /** Guest leaves phone — creates lead in pending status */
  async createLead(phoneRaw: string): Promise<{ ok: true }> {
    const phone = this.normalizeKzPhone(phoneRaw);
    if (!phone) {
      throw new BadRequestException("Некорректный номер телефона. Формат: +7 7** *** ** **");
    }
    const existingUser = await this.usersRepo.findOne({ where: { phone } });
    if (existingUser) {
      throw new ConflictException("Пользователь с таким номером уже существует");
    }
    const existingLead = await this.leadsRepo.findOne({ where: { phone } });
    if (existingLead) {
      // Idempotent — don't reveal status to guests
      return { ok: true };
    }
    await this.leadsRepo.save({ phone, status: "pending" });
    this.logger.log(`Registration lead created: ${phone}`);
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
  async getLeadByToken(token: string): Promise<{ phone: string; valid: boolean }> {
    if (!token || token.length < 32) return { phone: "", valid: false };
    const lead = await this.leadsRepo.findOne({ where: { token } });
    if (!lead) return { phone: "", valid: false };
    if (lead.status !== "approved") return { phone: lead.phone, valid: false };
    if (lead.tokenExpiresAt && lead.tokenExpiresAt < new Date()) {
      return { phone: lead.phone, valid: false };
    }
    return { phone: lead.phone, valid: true };
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

    // Username = phone in E.164 form (without "+" so it's URL-safe and
    // easy to type on login). Guaranteed unique because phone is unique.
    let username = lead.phone.replace(/^\+/, "");
    let suffix = 0;
    while (await this.usersRepo.findOne({ where: { username } })) {
      suffix++;
      username = `${lead.phone.replace(/^\+/, "")}_${suffix}`;
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.usersRepo.save({
      username,
      phone: lead.phone,
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
