import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { TelegramService } from "./telegram.service";

/**
 * HTTP entry point for Telegram updates. Telegram POSTs an update
 * payload here for every message/start command directed at the bot.
 *
 * We always respond 200 — Telegram retries 5xx aggressively, and we'd
 * rather log + swallow than amplify upstream issues. handleUpdate()
 * already absorbs its own errors.
 *
 * No auth on this endpoint by design — Telegram doesn't sign webhooks,
 * just sends to whatever URL we registered. To prevent forgery we could
 * add a secret-token query param via setWebHook({secret_token}); not
 * critical for an OTP-only flow where the worst a forger can do is
 * burn one of their own OTP attempts.
 */
@Controller("telegram")
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post("webhook")
  @HttpCode(200)
  async webhook(@Body() update: unknown): Promise<{ ok: true }> {
    await this.telegram.handleUpdate(update);
    return { ok: true };
  }
}
