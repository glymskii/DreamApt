import "reflect-metadata";
import { strict as assert } from "node:assert";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { entities } from "../src/database/database.module";
import { UserEntity } from "../src/database/entities/user.entity";
import { SearchProjectEntity } from "../src/database/entities/search-project.entity";
import { SearchRunEntity } from "../src/database/entities/search-run.entity";
import { AiUsageStatEntity } from "../src/database/entities/ai-usage-stat.entity";
import { SearchStatsService, hashClientIp } from "../src/search-stats/search-stats.service";
import { aiUsageContext } from "../src/search-stats/ai-usage-context";
import { ProjectsService } from "../src/projects/projects.service";
import { canAccessProject } from "../src/projects/project-access";
import { hasShutovAccess, omitShutov, shutovLockFor } from "../src/access-control/shutov-access";
import { parseGuestId } from "../src/auth/viewer.guard";

/**
 * Open search (guests, claiming), the Шутов gate and the search analytics,
 * against a real Postgres in a throwaway schema:
 * TEST_DATABASE_URL=postgresql://… pnpm --filter backend test:search-stats
 */
const SCHEMA = "search_stats_test";
const DAY = 24 * 60 * 60 * 1000;
const GUEST = "0b9f8a52-3c1d-4e7a-9a43-2f6f1d0c9e11";
const OTHER_GUEST = "6d1c2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e";

function pureRules() {
  assert.equal(parseGuestId(GUEST.toUpperCase()), GUEST);
  assert.equal(parseGuestId("not-a-uuid"), undefined);
  assert.equal(parseGuestId(undefined), undefined);

  const userId = "a1b2c3d4-0000-4000-8000-000000000001";
  const owned = { userId, guestId: null };
  const guests = { userId: null, guestId: GUEST };
  assert.ok(canAccessProject(owned, { userId }));
  assert.ok(!canAccessProject(owned, { userId: "a1b2c3d4-0000-4000-8000-000000000002" }));
  assert.ok(!canAccessProject(owned, { guestId: GUEST }));
  assert.ok(canAccessProject(owned, { userId: "x", role: "admin" }));
  assert.ok(canAccessProject(guests, { guestId: GUEST }));
  assert.ok(!canAccessProject(guests, { guestId: OTHER_GUEST }));
  // Claimed: the account owns it, the guest id no longer opens it.
  assert.ok(!canAccessProject({ userId, guestId: GUEST }, { guestId: GUEST }));

  const now = new Date("2026-11-09T12:00:00Z");
  const base = { role: "user", expertEnabled: false, searchPaidUntil: null };
  assert.ok(!hasShutovAccess(null, now));
  assert.ok(!hasShutovAccess(base, now));
  assert.ok(!hasShutovAccess({ ...base, searchPaidUntil: new Date(now.getTime() - 1) }, now));
  assert.ok(hasShutovAccess({ ...base, searchPaidUntil: new Date(now.getTime() + DAY) }, now));
  assert.ok(hasShutovAccess({ ...base, expertEnabled: true }, now));
  assert.ok(hasShutovAccess({ ...base, role: "admin" }, now));

  const row = { id: "c1", name: "ЖК", shutovCategory: 2 };
  assert.deepEqual(omitShutov(row), { id: "c1", name: "ЖК" });
  assert.equal(row.shutovCategory, 2, "the source row is left alone");

  assert.equal(hashClientIp("1.2.3.4"), hashClientIp("1.2.3.4"));
  assert.notEqual(hashClientIp("1.2.3.4"), hashClientIp("1.2.3.5"));
  assert.ok(!hashClientIp("1.2.3.4")!.includes("1.2.3.4"));
  assert.equal(hashClientIp(undefined), null);
}

async function main() {
  pureRules();

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log("search-stats: rules ok, database part skipped (set TEST_DATABASE_URL)");
    return;
  }

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
    const stats = new SearchStatsService(
      db.getRepository(SearchRunEntity),
      db.getRepository(AiUsageStatEntity),
    );
    const projects = new ProjectsService(db.getRepository(SearchProjectEntity));

    const buyer = await users.save(users.create({
      username: "77001112233", phone: "+77001112233", passwordHash: "x", phoneVerified: true,
    }));

    // ── Guest searches, then sign-in moves them to the account ──
    const guestProject = await projects.create({ guestId: GUEST }, "Гостевой поиск");
    assert.equal(guestProject.userId, null);
    assert.equal(guestProject.guestId, GUEST);
    assert.equal((await projects.findAllForViewer({ guestId: GUEST })).length, 1);
    assert.equal((await projects.findAllForViewer({ guestId: OTHER_GUEST })).length, 0);
    await assert.rejects(projects.findOne(guestProject.id, { guestId: OTHER_GUEST }), /not found/);

    const ownProject = await projects.create({ userId: buyer.id, guestId: GUEST }, "Свой поиск");
    assert.equal(ownProject.userId, buyer.id);
    assert.equal(ownProject.guestId, null, "a signed-in viewer's search is not a guest's");

    assert.equal(await projects.claimGuestProjects(buyer.id, GUEST), 1);
    assert.equal(await projects.claimGuestProjects(buyer.id, GUEST), 0);
    const claimed = await projects.findOne(guestProject.id, { userId: buyer.id });
    assert.equal(claimed.userId, buyer.id);
    assert.equal(claimed.guestId, null);
    await assert.rejects(projects.findOne(guestProject.id, { guestId: GUEST }), /not found/);
    assert.equal((await projects.findAllForViewer({ userId: buyer.id })).length, 2);

    // ── The Шутов gate reads the account ──
    assert.equal(await shutovLockFor(users, undefined), "login");
    assert.equal(await shutovLockFor(users, { id: buyer.id, role: "user" }), "subscribe");
    await users.update(buyer.id, { searchPaidUntil: new Date(Date.now() + DAY) });
    assert.equal(await shutovLockFor(users, { id: buyer.id, role: "user" }), null);

    // ── Search runs and OpenAI tokens ──
    const ip = hashClientIp("10.0.0.7");
    const guestRun = await stats.startRun({
      projectId: guestProject.id, userId: null, guestId: GUEST, userType: "guest", ipHash: ip,
    });
    const userRun = await stats.startRun({
      projectId: ownProject.id, userId: buyer.id, guestId: null, userType: "user", ipHash: ip,
    });

    // Outside a run: only the hourly totals.
    await stats.recordAiUsage("cjm", "gpt-4o-mini", 1000, 200);
    // Inside a run, even after awaits: the run counts it too.
    await aiUsageContext.run({ searchRunId: guestRun }, async () => {
      await stats.recordAiUsage("expand", "gpt-4o-mini", 300, 100);
      await Promise.all([
        stats.recordAiUsage("score", "gpt-4o-mini", 400, 50),
        stats.recordAiUsage("score", "gpt-4o-mini", 400, 50),
      ]);
    });
    await stats.finishRun(guestRun, "done", 42);
    await stats.finishRun(userRun, "empty", 0);

    const run = await db.getRepository(SearchRunEntity).findOneByOrFail({ id: guestRun });
    assert.equal(run.aiCalls, 3);
    assert.equal(run.promptTokens, 1100);
    assert.equal(run.completionTokens, 200);
    assert.equal(run.status, "done");
    assert.equal(run.propertyCount, 42);
    assert.ok(run.finishedAt);

    const since = new Date(Date.now() - DAY);
    assert.equal(await stats.countRunsSince({ ipHash: ip! }, since), 1, "a guest limit counts guests only");
    assert.equal(await stats.countRunsSince({ userId: buyer.id }, since), 1);
    assert.equal(await stats.countRunsSince({ ipHash: hashClientIp("10.0.0.8")! }, since), 0);

    const summary = await stats.summary(24);
    assert.equal(summary.searches.total, 2);
    assert.deepEqual(summary.searches.byUserType, { guest: 1, user: 1, admin: 0 });
    assert.equal(summary.searches.byStatus.done, 1);
    assert.equal(summary.searches.byStatus.empty, 1);
    assert.equal(summary.searches.people, 2);
    assert.equal(summary.tokens.calls, 4);
    assert.equal(summary.tokens.total, 1200 + 400 + 900);
    const score = summary.tokens.byPurpose.find((p) => p.purpose === "score")!;
    assert.deepEqual(score, { purpose: "score", calls: 2, prompt: 800, completion: 100, total: 900 });
    assert.deepEqual(summary.tokens.searchPipeline, { calls: 3, total: 1300, perSearch: 650 });
    assert.equal(summary.timeline.reduce((s, b) => s + b.searches, 0), 2);
    assert.equal(summary.timeline.reduce((s, b) => s + b.tokens, 0), 2500);
    assert.equal(summary.recent.length, 2);
    const recentGuest = summary.recent.find((r) => r.id === guestRun)!;
    assert.equal(recentGuest.user, null);
    assert.equal(recentGuest.tokens, 1300);
    assert.equal(summary.recent.find((r) => r.id === userRun)!.user?.phone, "+77001112233");

    console.log("search-stats: ok");
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
