import "reflect-metadata";
import { strict as assert } from "node:assert";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { AirQualityReadingEntity } from "../src/database/entities/air-quality-reading.entity";
import { AirQualityAggregateService } from "../src/air-quality/air-quality-aggregate.service";

/**
 * Hour buckets of the air archive against a real Postgres, in a throwaway
 * schema: TEST_DATABASE_URL=postgresql://… pnpm --filter backend test:air-profile
 */
const SCHEMA = "air_profile_test";

/** `YYYY-MM-DD HH:MM:SS` for a UTC instant, as a naive timestamp literal. */
function utc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log("air daily profile: skipped (set TEST_DATABASE_URL)");
    return;
  }
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}`);

  const db = new DataSource({
    type: "postgres",
    url,
    schema: SCHEMA,
    entities: [AirQualityReadingEntity],
    synchronize: true,
    // The server's sessions run in UTC; created_at literals below are UTC.
    extra: { options: `-c search_path=${SCHEMA},public -c TimeZone=UTC` },
  });
  await db.initialize();
  try {
    const insert = (station: string, lat: number, lng: number, pm25: number, recordedAt: string, createdAt: string) =>
      db.query(
        `INSERT INTO air_quality_readings (id, station_id, name, lat, lng, pm25, recorded_at, created_at)
         VALUES (gen_random_uuid(), $1, $1, $2, $3, $4, $5, $6)`,
        [station, lat, lng, pm25, recordedAt, createdAt],
      );

    // Two days ago at 00:00 UTC; Almaty is UTC+5.
    const day = Math.floor(Date.now() / 86400000) * 86400000 - 2 * 86400000;
    const h = (hours: number, minutes = 0) => day + hours * 3600000 + minutes * 60000;

    // A — UTC convention: recorded 03:10 UTC = 08:10 in Almaty.
    await insert("A", 43.25, 76.9, 10, utc(h(3, 10)), utc(h(3, 30)));
    await insert("A", 43.25, 76.9, 20, utc(h(27, 5)), utc(h(27, 30)));
    // B — naive Almaty time from an older source: 13:00 local, stored at
    // 08:20 UTC. Two snapshots of the same hour count as one.
    await insert("B", 43.2, 76.95, 40, utc(h(13)), utc(h(8, 20)));
    await insert("B", 43.2, 76.95, 60, utc(h(13)), utc(h(8, 50)));
    // C — a second unit at A's address: merged into one marker.
    await insert("C", 43.25, 76.9, 30, utc(h(3, 20)), utc(h(3, 30)));
    // Outside a 14-day window.
    await insert("A", 43.25, 76.9, 99, utc(day - 30 * 86400000), utc(day - 30 * 86400000));

    const service = new AirQualityAggregateService(db.getRepository(AirQualityReadingEntity));
    const profile = await service.getDailyProfile(14);

    assert.equal(profile.timezone, "Asia/Almaty");
    assert.equal(profile.days, 14);
    assert.equal(profile.daysCovered, 2, "A's second reading lands on the next local day");
    assert.equal(profile.stations.length, 2, "C shares A's marker");

    const a = profile.stations.find((s) => s.lat === 43.25)!;
    const b = profile.stations.find((s) => s.lat === 43.2)!;
    assert.equal(a.pm25.length, 24);
    // A's hour 8 averages its two days (15); C adds its own mean (30).
    assert.equal(a.pm25[8], 22.5);
    assert.equal(a.pm25[3], null, "UTC readings must not stay in UTC hours");
    assert.equal(b.pm25[13], 50, "local readings keep their hour; snapshots dedupe");
    assert.equal(b.pm25[18], null, "local readings must not be shifted again");

    assert.deepEqual(profile.hours[8], { hour: 8, avgPm25: 22.5, stations: 1 });
    assert.deepEqual(profile.hours[13], { hour: 13, avgPm25: 50, stations: 1 });
    assert.deepEqual(profile.hours[0], { hour: 0, avgPm25: null, stations: 0 });

    // Once a big feed arrives, only the days it covered count: ten more
    // sensors on the first day make it the one citywide day.
    for (let i = 1; i <= 10; i++) {
      await insert(`E${i}`, 43.2 + i / 100, 76.8, 12, utc(h(4)), utc(h(4, 10)));
    }
    const citywide = await new AirQualityAggregateService(db.getRepository(AirQualityReadingEntity))
      .getDailyProfile(14);
    assert.equal(citywide.daysCovered, 1);
    assert.equal(citywide.hours[9].stations, 10);

    // The ЖК card's breakdown uses the same local hours. D reports its UTC
    // hour as the value for three days, so local hour L should read L − 5.
    for (let d = -1; d <= 1; d++) {
      for (let i = 0; i < 24; i++) {
        await insert("D", 43.3, 77.05, i, utc(h(d * 24 + i, 5)), utc(h(d * 24 + i, 15)));
      }
    }
    const fresh = new AirQualityAggregateService(db.getRepository(AirQualityReadingEntity));
    const around = await fresh.getForLocation(43.3, 77.05, 1, 14);
    assert.equal(around.location?.samples, 72);
    const bucket = (hour: number) => around.location?.byHour.find((x) => x.hour === hour);
    assert.deepEqual(bucket(8), { hour: 8, avgPm25: 3, samples: 3 });
    assert.deepEqual(bucket(0), { hour: 0, avgPm25: 19, samples: 3 });

    console.log("air daily profile: ok");
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
