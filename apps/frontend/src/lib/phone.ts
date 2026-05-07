/**
 * Kazakhstan phone number formatting + validation.
 *
 * Display format: +7 (777) 123-45-67
 * E.164 / submit form: +77771234567
 */

const KZ_BODY_LEN = 10; // digits after +7

/**
 * Format a partial digit input into "+7 (___) ___-__-__" mask.
 * - Strips non-digits
 * - Drops leading 7 or 8 country code so the body is 10 digits max
 * - Pads with placeholder gaps as the user types
 */
export function formatKzPhone(raw: string): string {
  const digits = (raw || "").replace(/\D+/g, "");
  // Strip leading 7 / 8 country code so we always work with the 10-digit body
  let body = digits;
  if (body.startsWith("7") || body.startsWith("8")) body = body.slice(1);
  body = body.slice(0, KZ_BODY_LEN);

  if (body.length === 0) return "+7 ";

  const a = body.slice(0, 3);
  const b = body.slice(3, 6);
  const c = body.slice(6, 8);
  const d = body.slice(8, 10);

  let out = "+7 (" + a;
  if (body.length >= 3) out += ")";
  if (b) out += " " + b;
  if (c) out += "-" + c;
  if (d) out += "-" + d;
  return out;
}

/** Returns the E.164 form (+77XXXXXXXXX) or null if input incomplete/invalid */
export function toE164(raw: string): string | null {
  const digits = (raw || "").replace(/\D+/g, "");
  let body = digits;
  if (body.startsWith("7") || body.startsWith("8")) body = body.slice(1);
  if (body.length !== KZ_BODY_LEN) return null;
  // KZ mobile: first body digit must be 7
  if (!body.startsWith("7")) return null;
  return "+7" + body;
}

/** Display formatter for already-saved phone (e.g. lead.phone in admin table) */
export function formatStoredPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D+/g, "");
  if (digits.length !== 11) return phone;
  const body = digits.slice(1);
  return `+7 (${body.slice(0, 3)}) ${body.slice(3, 6)}-${body.slice(6, 8)}-${body.slice(8, 10)}`;
}
