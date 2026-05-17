import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
// node-telegram-bot-api ships as CJS; using require for clean callability.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TelegramBot = require("node-telegram-bot-api");
import { OtpCodeEntity } from "../database/entities/otp-code.entity";

/**
 * Telegram-bot integration for the OTP registration flow.
 *
 * Wiring:
 *  - On boot, if TELEGRAM_BOT_TOKEN is set, instantiate a webhook-mode
 *    bot, fetch its username (used in the deeplink frontend renders),
 *    and register the webhook URL with Telegram so they POST updates
 *    to /api/telegram/webhook.
 *  - The HTTP handler in TelegramController calls handleUpdate() with
 *    each incoming Telegram update payload.
 *  - sendCode() / sendMessage() let other services push messages to a
 *    known chat id.
 *
 * Why webhook and not polling: we already have a public HTTPS endpoint
 * (Render), and webhooks scale to zero — the bot doesn't keep an idle
 * connection alive. Trade-off: cold-starts add ~30s on Render Free, but
 * we're on Starter where the box stays up.
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  // `any` until @types ships richer types for the inferred CJS import.
  private bot: any | null = null;
  private _botUsername: string | null = null;

  constructor(
    @InjectRepository(OtpCodeEntity)
    private otpRepo: Repository<OtpCodeEntity>,
  ) {}

  get isConfigured(): boolean {
    return this.bot !== null;
  }

  get botUsername(): string | null {
    return this._botUsername;
  }

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn(
        "TELEGRAM_BOT_TOKEN not set — Telegram OTP flow is disabled. " +
          "Set the env var and redeploy to enable.",
      );
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: false });
      const me = await this.bot.getMe();
      this._botUsername = me.username;
      this.logger.log(`Telegram bot loaded: @${me.username}`);

      // Register webhook. Skip when SELF_URL isn't known (local dev) —
      // OTP still works via polling fallback for local testing if needed.
      const selfUrl =
        process.env.PUBLIC_API_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        null;
      if (selfUrl) {
        const webhookUrl = selfUrl.replace(/\/$/, "") + "/api/telegram/webhook";
        await this.bot.setWebHook(webhookUrl, {
          // Restrict to message updates — we don't care about edited
          // messages, channel posts, callback queries, etc.
          allowed_updates: ["message"],
        });
        this.logger.log(`Telegram webhook set to ${webhookUrl}`);
      } else {
        this.logger.warn(
          "PUBLIC_API_URL / RENDER_EXTERNAL_URL not set — webhook NOT registered. " +
            "Telegram won't be able to deliver updates. Set the env var.",
        );
      }
    } catch (err) {
      this.logger.error(`Telegram bot init failed: ${err}`);
      this.bot = null;
    }
  }

  /**
   * Build the t.me deeplink the frontend shows after /auth/otp/request.
   * The `?start=` payload is the OTP's sessionToken — when the user
   * taps "Start" in Telegram the bot receives `/start <sessionToken>`.
   */
  deeplinkFor(sessionToken: string): string | null {
    if (!this._botUsername) return null;
    return `https://t.me/${this._botUsername}?start=${sessionToken}`;
  }

  /**
   * Process one Telegram update. Currently only cares about /start
   * commands with a payload — that's the only thing the bot supports.
   *
   * Always returns 200 to Telegram (no thrown errors propagate),
   * because Telegram retries failed webhooks aggressively — we'd
   * rather log + swallow than amplify upstream issues.
   */
  async handleUpdate(update: any): Promise<void> {
    if (!this.bot) return;

    const msg = update?.message;
    if (!msg || !msg.chat?.id) return;
    const chatId = msg.chat.id;
    const text: string = msg.text || "";

    try {
      const m = text.match(/^\/start(?:\s+(\S+))?/);
      if (!m) {
        // Any other message — friendly greeting.
        await this.bot.sendMessage(
          chatId,
          "Привет! Этот бот выдаёт коды подтверждения для DreamApt.kz.\n" +
            "Чтобы получить код, начните регистрацию на сайте.",
        );
        return;
      }

      const sessionToken = m[1];
      if (!sessionToken) {
        await this.bot.sendMessage(
          chatId,
          "Чтобы получить код подтверждения, перейдите на DreamApt.kz, " +
            "введите номер телефона и нажмите кнопку «Открыть Telegram». " +
            "Откроется этот бот с уже подставленным кодом сессии.",
        );
        return;
      }

      // Look up the OTP row by session token
      const otp = await this.otpRepo.findOne({ where: { sessionToken } });
      if (!otp) {
        await this.bot.sendMessage(
          chatId,
          "Ссылка не найдена. Возможно, она устарела — вернитесь на сайт " +
            "и запросите код заново.",
        );
        return;
      }
      if (otp.expiresAt < new Date()) {
        await this.bot.sendMessage(
          chatId,
          "Срок действия этой ссылки истёк. Вернитесь на сайт и нажмите " +
            "«Запросить код» ещё раз.",
        );
        return;
      }
      if (otp.verifiedAt) {
        await this.bot.sendMessage(
          chatId,
          "Этот код уже использован. Если нужно зайти ещё раз, " +
            "запросите новый код на сайте.",
        );
        return;
      }

      // Stamp chat id + send the actual code
      otp.chatId = String(chatId);
      otp.codeSentAt = new Date();
      await this.otpRepo.save(otp);

      await this.bot.sendMessage(
        chatId,
        `🔐 Ваш код для DreamApt: <b>${otp.code}</b>\n\n` +
          "Введите его в открытой странице сайта.\n" +
          "Код действует 10 минут.",
        { parse_mode: "HTML" },
      );
    } catch (err) {
      this.logger.warn(`handleUpdate failed for chat ${chatId}: ${err}`);
    }
  }
}
