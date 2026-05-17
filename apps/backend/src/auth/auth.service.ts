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
// Legacy admin username — kept only for finding the existing row on first
// boot after we switched to phone-based admin login.
const LEGACY_ADMIN_USERNAME = "admin";

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
   * On startup ensure the admin user exists with the right credentials.
   *
   * Identity resolution order:
   *   1. ADMIN_PHONE env (e.g. "+77078388077") → admin's username AND phone
   *      both become this number. This is the production path.
   *   2. Fallback: legacy username="admin", no phone. Dev-only.
   *
   * Migration: if a legacy admin (username="admin") exists and ADMIN_PHONE
   * is set, we *update* that same row instead of creating a duplicate. The
   * id stays stable so existing JWTs/wishlist/projects keep their owner.
   *
   * Password rotates from ADMIN_PASSWORD env if set and different from
   * what's stored. Without the env, dev fallback is "admin" (logs a warning).
   */
  async onModuleInit() {
    const envPassword = process.env.ADMIN_PASSWORD;
    if (!envPassword) {
      this.logger.warn(
        "ADMIN_PASSWORD is NOT set in env — falling back to insecure 'admin'. Set a strong password before going public!",
      );
    }
    const password = envPassword || "admin";

    const envPhoneRaw = process.env.ADMIN_PHONE;
    const adminPhone = envPhoneRaw ? this.normalizeKzPhone(envPhoneRaw) : null;
    if (envPhoneRaw && !adminPhone) {
      this.logger.warn(
        `ADMIN_PHONE env "${envPhoneRaw}" is not a valid KZ mobile number; falling back to username-only admin`,
      );
    }
    const adminIdentifier = adminPhone || LEGACY_ADMIN_USERNAME;

    // Find existing admin by either the new phone-based identifier or the
    // legacy "admin" username. Either matches a single row (admin should be
    // unique), so we treat them interchangeably for migration purposes.
    let existing = adminPhone
      ? await this.usersRepo.findOne({ where: { phone: adminPhone } })
      : null;
    if (!existing) {
      existing = await this.usersRepo.findOne({
        where: { username: LEGACY_ADMIN_USERNAME },
      });
    }
    if (!existing && adminPhone) {
      // Edge case: phone differs from any existing user but username "admin"
      // also doesn't exist. Search by current adminIdentifier to be safe.
      existing = await this.usersRepo.findOne({
        where: { username: adminIdentifier },
      });
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);

    if (!existing) {
      const newAdmin: Partial<UserEntity> = {
        username: adminIdentifier,
        passwordHash: hash,
        role: "admin",
      };
      if (adminPhone) newAdmin.phone = adminPhone;
      await this.usersRepo.save(newAdmin);
      this.logger.log(`Admin user created with identifier: ${adminIdentifier}`);
      return;
    }

    // Migrate the existing row: align username/phone to env, rotate password
    // if it changed, ensure admin role. Single UPDATE keeps the id stable.
    // Cast to any avoids TypeORM's QueryDeepPartialEntity choking on the
    // optional relations (projects[]) declared on UserEntity.
    const updates: Record<string, unknown> = {};
    if (existing.username !== adminIdentifier) updates.username = adminIdentifier;
    if (adminPhone && existing.phone !== adminPhone) updates.phone = adminPhone;
    if (existing.role !== "admin") updates.role = "admin";

    const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
    if (!passwordMatches) updates.passwordHash = hash;

    if (Object.keys(updates).length > 0) {
      await this.usersRepo.update(existing.id, updates);
      const fields = Object.keys(updates).filter((k) => k !== "passwordHash");
      this.logger.log(
        `Admin row migrated: ${fields.join(", ") || "password only"} (id=${existing.id}, identifier=${adminIdentifier})`,
      );
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
      user: this.toAuthUserDTO(user),
    };
  }

  /** Returns the freshest user record for the authenticated caller — used
   *  by the frontend's AuthProvider mount-effect to reconcile cached flags
   *  with the server. Returns 404-ish (NotFound) only if the user was hard
   *  deleted; otherwise the JWT is still trusted.
   */
  async getProfile(userId: string) {
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    if (!u) throw new UnauthorizedException("User not found");
    return this.toAuthUserDTO(u);
  }

  private toAuthUserDTO(user: UserEntity) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      displayName: user.displayName || null,
      phoneVerified: user.phoneVerified,
      searchEnabled: user.searchEnabled,
      expertEnabled: user.expertEnabled,
      createdAt: user.createdAt.toISOString(),
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
