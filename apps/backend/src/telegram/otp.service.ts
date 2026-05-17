import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, LessThan } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { Cron } from "@nestjs/schedule";
import * as crypto from "crypto";
import { OtpCodeEntity } from "../database/entities/otp-code.entity";
import { UserEntity } from "../database/entities/user.entity";
import { TelegramService } from "./telegram.service";

/** OTPs live 10 minutes — long enough that a slow user can switch apps,
 *  short enough that a leaked code becomes useless quickly. */
const OTP_TTL_MS = 10 * 60 * 1000;
/** Per-row attempt cap. Hits 5 → row is dead, user requests a new OTP. */
const MAX_ATTEMPTS = 5;
/** Per-phone rolling window for /request — prevents OTP spam to one number. */
const REQUEST_WINDOW_MS = 60 * 1000;
const REQUESTS_PER_WINDOW = 3;

/**
 * Telegram-OTP authentication service. Owns the request → verify → login
 * loop and the OtpCodeEntity rows behind it.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpCodeEntity)
    private otpRepo: Repository<OtpCodeEntity>,
    @InjectRepository(UserEntity)
    private usersRepo: Repository<UserEntity>,
    private telegram: TelegramService,
    private jwt: JwtService,
  ) {}

  /**
   * Step 1: Generate a fresh OTP for `phone` and return the Telegram
   * deeplink the frontend should display.
   *
   * Rate-limited per phone (3 requests / minute) so a malicious frontend
   * can't burn the cron-prune budget. The bot itself enforces a similar
   * cap by message rate on Telegram's side.
   */
  async requestOtp(rawPhone: string): Promise<{
    sessionToken: string;
    telegramDeeplink: string | null;
    botUsername: string | null;
    expiresInSec: number;
  }> {
    if (!this.telegram.isConfigured) {
      throw new ServiceUnavailableException(
        "Telegram бот не настроен на сервере",
      );
    }
    const phone = normaliseKzPhone(rawPhone);
    if (!phone) {
      throw new BadRequestException("Некорректный номер. Формат: +7 7** *** ** **");
    }

    // Rate-limit recent requests for the same phone
    const since = new Date(Date.now() - REQUEST_WINDOW_MS);
    const recent = await this.otpRepo
      .createQueryBuilder("o")
      .where("o.phone = :phone", { phone })
      .andWhere("o.createdAt > :since", { since })
      .getCount();
    if (recent >= REQUESTS_PER_WINDOW) {
      throw new BadRequestException(
        `Слишком много запросов. Подождите минуту перед следующей попыткой.`,
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    // 16-byte hex is 32 chars; Telegram /start payloads can be up to 64.
    const sessionToken = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.otpRepo.save({ phone, code, sessionToken, expiresAt });

    this.logger.log(`OTP requested for ${maskPhone(phone)}`);
    return {
      sessionToken,
      telegramDeeplink: this.telegram.deeplinkFor(sessionToken),
      botUsername: this.telegram.botUsername,
      expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    };
  }

  /**
   * Step 2: User typed the code on the frontend. Look up the most recent
   * unverified OTP for this phone, validate, then either create or log
   * in the user. Returns a JWT.
   */
  async verifyOtp(rawPhone: string, code: string): Promise<{
    accessToken: string;
    user: {
      id: string;
      username: string;
      phone: string;
      role: string;
      phoneVerified: boolean;
      searchEnabled: boolean;
      expertEnabled: boolean;
    };
    isNewUser: boolean;
  }> {
    const phone = normaliseKzPhone(rawPhone);
    if (!phone) {
      throw new BadRequestException("Некорректный номер");
    }
    const codeClean = String(code || "").replace(/\D+/g, "");
    if (codeClean.length !== 6) {
      throw new BadRequestException("Код должен быть 6 цифр");
    }

    const otp = await this.otpRepo.findOne({
      where: { phone, verifiedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
    if (!otp) {
      throw new UnauthorizedException(
        "Код не найден. Запросите новый.",
      );
    }
    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException("Срок действия кода истёк");
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        "Слишком много неверных попыток. Запросите новый код.",
      );
    }
    if (otp.code !== codeClean) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException(
        `Неверный код. Осталось попыток: ${MAX_ATTEMPTS - otp.attempts}`,
      );
    }

    // Code accepted — mark verified
    otp.verifiedAt = new Date();
    await this.otpRepo.save(otp);

    // Find-or-create user. Phone is the primary identity for OTP users.
    let user = await this.usersRepo.findOne({ where: { phone } });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const username = phone.replace(/^\+/, "");
      user = await this.usersRepo.save({
        username,
        phone,
        // No password — OTP-only auth. We set a non-empty hash to
        // satisfy the column constraint; bcrypt verify against this
        // hash will never match a user-supplied password.
        passwordHash: "OTP_ONLY_NO_PASSWORD",
        role: "user",
        phoneVerified: true,
      } as any);
      this.logger.log(`New user via OTP: ${maskPhone(phone)} (id=${user!.id})`);
    } else if (!user.phoneVerified) {
      // Existing user (e.g. admin or legacy lead-created account) — just
      // mark phone verified now that they've completed the loop.
      user.phoneVerified = true;
      await this.usersRepo.save(user);
    }

    const accessToken = this.jwt.sign({
      sub: user!.id,
      username: user!.username,
      role: user!.role,
    });

    return {
      accessToken,
      user: {
        id: user!.id,
        username: user!.username,
        phone: user!.phone,
        role: user!.role,
        phoneVerified: user!.phoneVerified,
        searchEnabled: user!.searchEnabled,
        expertEnabled: user!.expertEnabled,
      },
      isNewUser,
    };
  }

  /** Daily 4:15 AM — drop expired/verified rows older than 24h. */
  @Cron("15 4 * * *")
  async prune() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.otpRepo.delete({ expiresAt: LessThan(cutoff) });
    this.logger.log(`Pruned ${result.affected ?? 0} expired OTP rows`);
  }
}

/** Coerce arbitrary KZ phone input to E.164. Returns null if doesn't
 *  look like a KZ mobile (carrier prefix must be 7XX). */
function normaliseKzPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  let n: string | null = null;
  if (digits.length === 11 && digits.startsWith("7")) n = "+" + digits;
  else if (digits.length === 11 && digits.startsWith("8")) n = "+7" + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith("7")) n = "+7" + digits;
  if (!n) return null;
  if (!/^\+77\d{9}$/.test(n)) return null;
  return n;
}

/** Mask middle digits when logging — privacy. */
function maskPhone(p: string): string {
  if (p.length < 8) return p;
  return p.slice(0, 5) + "****" + p.slice(-3);
}
