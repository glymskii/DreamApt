import "reflect-metadata";
import { strict as assert } from "node:assert";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { entities } from "../src/database/database.module";
import { PaymentEntity } from "../src/database/entities/payment.entity";
import { UserEntity } from "../src/database/entities/user.entity";
import { PaymentsService } from "../src/payments/payments.service";
import type { PaymentProvider } from "../src/payments/providers/payment-provider";
import { hasSearchAccess } from "../src/access-control/search-access";
import type { TelegramService } from "../src/telegram/telegram.service";

/**
 * Payments against a real Postgres, in a throwaway schema:
 * TEST_DATABASE_URL=postgresql://… pnpm --filter backend test:payments
 */
const SCHEMA = "payments_test";
const DAY = 24 * 60 * 60 * 1000;

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (err: Error) => pattern.test(err.message));
}

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log("payments: skipped (set TEST_DATABASE_URL)");
    return;
  }
  process.env.SEARCH_PLAN_PRICE_KZT = "3000";
  process.env.SEARCH_PLAN_DAYS = "30";

  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);
  const db = new DataSource({
    type: "postgres",
    url,
    schema: SCHEMA,
    entities,
    synchronize: true,
    extra: { options: `-c search_path=${SCHEMA},public` },
  });
  await db.initialize();

  try {
    const users = db.getRepository(UserEntity);
    const payments = db.getRepository(PaymentEntity);
    const messages: Array<[string, string]> = [];
    const telegram = {
      sendMessage: async (chatId: string, text: string) => (messages.push([chatId, text]), true),
    } as unknown as TelegramService;

    let requested = 0;
    let providerVerdict: "paid" | null = null;
    const provider: PaymentProvider = {
      id: "test",
      requestPayment: async () => (requested++, { status: "pending" }),
      checkStatus: async () => providerVerdict,
    };
    const service = new PaymentsService(payments, users, provider, telegram);

    const buyer = await users.save(users.create({
      username: "77001112233", phone: "+77001112233", passwordHash: "x",
      phoneVerified: true, telegramChatId: "555",
    }));
    const stranger = await users.save(users.create({
      username: "77009998877", phone: "+77009998877", passwordHash: "x", phoneVerified: false,
    }));

    const [plan] = service.plans();
    assert.deepEqual(plan, { id: "search-30d", feature: "search", days: 30, amount: 3000 });
    await rejects(service.checkout(buyer.id, "gold"), /Тариф не найден/);
    await rejects(service.checkout(stranger.id, plan.id), /Подтвердите номер/);

    // A double click returns the same open payment and bills once.
    const first = await service.checkout(buyer.id, plan.id);
    assert.equal(first.status, "pending");
    assert.equal(first.phone, "+77001112233");
    assert.equal((await service.checkout(buyer.id, plan.id)).id, first.id);
    assert.equal(requested, 1);

    const invoiced = await service.markInvoiced(first.id, buyer.id, "  KP-1  ");
    assert.equal(invoiced.status, "invoiced");
    assert.equal(invoiced.externalId, "KP-1");

    // Paid: 30 days from now, the buyer can search and hears about it.
    const before = Date.now();
    const paid = await service.markPaid(first.id, buyer.id);
    assert.equal(paid.status, "paid");
    const until1 = new Date(paid.accessUntil!).getTime();
    assert.ok(Math.abs(until1 - (before + 30 * DAY)) < 60_000);
    assert.ok(hasSearchAccess((await users.findOneByOrFail({ id: buyer.id }))));
    assert.ok(!hasSearchAccess((await users.findOneByOrFail({ id: buyer.id })), new Date(until1 + 1000)));
    assert.equal(messages.length, 1);
    assert.equal(messages[0][0], "555");
    assert.match(messages[0][1], /3 000 ₸/);
    await rejects(service.markPaid(first.id, buyer.id), /уже оплачен/);

    // Renewing early adds the days to the end of the running period, and
    // two confirmations at once count once.
    const second = await service.checkout(buyer.id, plan.id);
    assert.notEqual(second.id, first.id);
    const results = await Promise.allSettled([
      service.settle(second.id, buyer.id),
      service.settle(second.id, buyer.id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const until2 = (await users.findOneByOrFail({ id: buyer.id })).searchPaidUntil!.getTime();
    assert.equal(until2, until1 + 30 * DAY);

    // The buyer cancels a payment before the invoice is out; after that the
    // invoice is declined in Kaspi. A closed payment stays closed.
    const third = await service.checkout(buyer.id, plan.id);
    await rejects(service.cancelMine(stranger.id, third.id), /не найден/);
    await payments.update(third.id, { status: "invoiced" });
    await rejects(service.cancelMine(buyer.id, third.id), /отклоните его в приложении Kaspi/);
    await payments.update(third.id, { status: "pending" });
    assert.equal((await service.cancelMine(buyer.id, third.id)).status, "cancelled");
    await rejects(service.cancelMine(buyer.id, third.id), /уже отменён/);
    await rejects(service.markPaid(third.id, buyer.id), /уже отменён/);

    // Open for over a week: expired. Only an admin can still credit it.
    const stale = await service.checkout(buyer.id, plan.id);
    await payments.update(stale.id, { createdAt: new Date(Date.now() - 8 * DAY) });
    assert.equal(await service.expireStale(), 1);
    assert.equal((await payments.findOneByOrFail({ id: stale.id })).status, "expired");
    await rejects(service.settle(stale.id, null), /уже истёк/);
    const lateUntil = (await service.markPaid(stale.id, buyer.id)).accessUntil!;
    assert.equal(Date.parse(lateUntil), until2 + 30 * DAY);
    const until3 = Date.parse(lateUntil);

    // A provider that sees the payment settles it without an admin.
    const auto = await service.checkout(buyer.id, plan.id);
    await payments.update(auto.id, { status: "invoiced", provider: "test" });
    await service.syncWithProvider();
    assert.equal((await payments.findOneByOrFail({ id: auto.id })).status, "invoiced");
    providerVerdict = "paid";
    await service.syncWithProvider();
    const settled = await payments.findOneByOrFail({ id: auto.id });
    assert.equal(settled.status, "paid");
    assert.equal(settled.processedBy, null);
    assert.equal((await users.findOneByOrFail({ id: buyer.id })).searchPaidUntil!.getTime(), until3 + 30 * DAY);

    const mine = await service.listMine(buyer.id);
    assert.equal(mine.length, 5);
    assert.equal((await service.listForAdmin("open")).length, 0);
    assert.equal((await service.listForAdmin("paid")).length, 4);

    console.log("payments: ok");
  } finally {
    await db.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
