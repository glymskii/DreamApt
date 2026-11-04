import "reflect-metadata";
import { strict as assert } from "node:assert";
import { Client } from "pg";
import { DataSource } from "typeorm";
import { AirQualityReadingEntity } from "../src/database/entities/air-quality-reading.entity";
import { AirQualityDailyEntity } from "../src/database/entities/air-quality-daily.entity";
import { AirQualityStationEntity } from "../src/database/entities/air-quality-station.entity";
import { AirQualityImportEntity } from "../src/database/entities/air-quality-import.entity";
import { AirQualityAggregateService } from "../src/air-quality/air-quality-aggregate.service";
import { AirQualityArchiveService } from "../src/air-quality/air-quality-archive.service";

/**
 * The air history pipeline against a real Postgres, in a throwaway schema:
 * raw snapshots → hourly rollup → archive → aggregates, plus imports of the
 * Almaty Air Initiative dataset.
 *   TEST_DATABASE_URL=postgresql://… pnpm --filter backend test:air-profile
 */
const SCHEMA = "air_profile_test";

/** `YYYY-MM-DD HH:MM:SS` for a UTC instant, as a naive timestamp literal. */
function utc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Almaty calendar day of a UTC instant. */
function almatyDay(ms: number): string {
  return new Date(ms + 5 * 3600000).toISOString().slice(0, 10);
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
    entities: [AirQualityReadingEntity, AirQualityDailyEntity, AirQualityStationEntity, AirQualityImportEntity],
    synchronize: true,
    // The server's sessions run in UTC; created_at literals below are UTC.
    extra: { options: `-c search_path=${SCHEMA},public -c TimeZone=UTC` },
  });
  await db.initialize();
  try {
    const archive = new AirQualityArchiveService(
      db.getRepository(AirQualityDailyEntity),
      db.getRepository(AirQualityImportEntity),
    );
    const aggregates = () => new AirQualityAggregateService(db.getRepository(AirQualityDailyEntity));
    /** A first-ever rollup over everything the raw table holds. */
    const rebuild = async () => {
      await db.query(`DELETE FROM air_quality_daily`);
      return archive.rollupLive();
    };
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

    assert.ok((await rebuild()) > 0, "rollup writes live days");
    const profile = await aggregates().getDailyProfile(14);

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

    // A year window reaches the 30-day-old reading too.
    const year = await aggregates().getDailyProfile(365);
    assert.equal(year.firstDay, almatyDay(day - 30 * 86400000));

    // Weekdays and weekends split the same days between them.
    const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
    const weekday = await aggregates().getDailyProfile(14, "weekday");
    const weekend = await aggregates().getDailyProfile(14, "weekend");
    assert.equal(weekday.dayType, "weekday");
    assert.equal(profile.dayType, "all");
    assert.equal(weekday.daysCovered + weekend.daysCovered, profile.daysCovered);
    for (const p of [weekday, weekend]) {
      for (const d of [p.firstDay, p.lastDay]) {
        if (d) assert.equal(isWeekend(d), p.dayType === "weekend", `${d} in the ${p.dayType} profile`);
      }
    }

    // Once a big feed arrives, only the days it covered count: ten more
    // sensors on the first day make it the one citywide day.
    for (let i = 1; i <= 10; i++) {
      await insert(`E${i}`, 43.2 + i / 100, 76.8, 12, utc(h(4)), utc(h(4, 10)));
    }
    await rebuild();
    const citywide = await aggregates().getDailyProfile(14);
    assert.equal(citywide.daysCovered, 1);
    assert.equal(citywide.hours[9].stations, 10);

    // The ЖК card's breakdown uses the same local hours. D reports its UTC
    // hour as the value for three days, so local hour L should read L − 5.
    for (let d = -1; d <= 1; d++) {
      for (let i = 0; i < 24; i++) {
        await insert("D", 43.3, 77.05, i, utc(h(d * 24 + i, 5)), utc(h(d * 24 + i, 15)));
      }
    }
    await rebuild();
    const around = await aggregates().getForLocation(43.3, 77.05, 1, 14);
    assert.equal(around.location?.samples, 72);
    const bucket = (hour: number) => around.location?.byHour.find((x) => x.hour === hour);
    assert.deepEqual(bucket(8), { hour: 8, avgPm25: 3, samples: 3 });
    assert.deepEqual(bucket(0), { hour: 0, avgPm25: 19, samples: 3 });

    // An incremental rollup re-does only the newest days and is idempotent.
    const before = await db.query(`SELECT COUNT(*)::int AS n FROM air_quality_daily`);
    await archive.rollupLive();
    const after = await db.query(`SELECT COUNT(*)::int AS n FROM air_quality_daily`);
    assert.equal(after[0].n, before[0].n);

    // ── AAI dataset imports ────────────────────────────────────────────
    await db.query(`TRUNCATE air_quality_readings, air_quality_daily, air_quality_stations, air_quality_imports`);
    const L = almatyDay(Date.now() - 3 * 86400000);
    const L1 = almatyDay(Date.now() - 2 * 86400000);
    const L2 = almatyDay(Date.now() - 1 * 86400000);
    /** UTC instant of an Almaty wall-clock hour. */
    const at = (localDay: string, hour: number) => Date.parse(`${localDay}T${String(hour).padStart(2, "0")}:00:00+05:00`);
    const header = `"origin","source","name","datetime","id","pm25","aqi_pm25","pm10","no2","lat","lon","region","district","district_ru","is_valid"`;
    const row = (id: string, localDay: string, hour: number, pm25: number) =>
      `AirGradient,airgradient,"School ${id}",${localDay} ${String(hour).padStart(2, "0")}:00:00.000,"${id}",${pm25},,,,43.2,76.9,Алматы,,Бостандыкский район,true`;

    // Our live snapshot of the same AirGradient unit on day L…
    await insert("ag-500", 43.2, 76.9, 99, utc(at(L, 10) + 5 * 60000), utc(at(L, 10) + 10 * 60000));
    await archive.rollupLive();
    let cell = await db.query(`SELECT source, pm25 FROM air_quality_daily WHERE station_id = 'ag-500' AND day = $1`, [L]);
    assert.equal(cell[0].source, "live");
    assert.equal(cell[0].pm25[10], 99);

    // …is replaced by the dataset once it publishes that day.
    const first = await archive.importFile("open_sensors/x/AAI_test.csv", "sha-1", [
      header,
      row("500", L, 10, 20),
      row("500", L, 11, 22),
      row("500", L1, 0, 30),
    ]);
    assert.deepEqual([first.firstDay, first.lastDay, first.rows, first.stations], [L, L1, 2, 1]);
    cell = await db.query(`SELECT source, pm25, hours FROM air_quality_daily WHERE station_id = 'ag-500' AND day = $1`, [L]);
    assert.equal(cell[0].source, "aai");
    assert.equal(cell[0].pm25[10], 20);
    assert.equal(cell[0].hours, 2);

    // Live snapshots never overwrite a day the dataset owns; later days roll up.
    await insert("ag-500", 43.2, 76.9, 77, utc(at(L1, 12) + 5 * 60000), utc(at(L1, 12) + 10 * 60000));
    await insert("ag-500", 43.2, 76.9, 55, utc(at(L2, 1) + 5 * 60000), utc(at(L2, 1) + 10 * 60000));
    await archive.rollupLive();
    const days = await db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, pm25 FROM air_quality_daily
       WHERE station_id = 'ag-500' ORDER BY day`,
    );
    assert.deepEqual(days.map((d: any) => [d.day, d.source]), [[L, "aai"], [L1, "aai"], [L2, "live"]]);
    assert.equal(days[1].pm25[12], null, "L1 stays as the dataset has it");
    assert.equal(days[2].pm25[1], 55);

    // A republished file replaces the old version across both ranges; the
    // day it no longer covers goes back to our live rollup.
    await archive.importFile("open_sensors/x/AAI_test.csv", "sha-2", [header, row("500", L, 10, 21)]);
    await archive.rollupLive();
    const again = await db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, pm25 FROM air_quality_daily
       WHERE station_id = 'ag-500' ORDER BY day`,
    );
    assert.deepEqual(again.map((d: any) => [d.day, d.source]), [[L, "aai"], [L1, "live"], [L2, "live"]]);
    assert.equal(again[0].pm25[10], 21);
    assert.equal(again[1].pm25[12], 77);
    const imports = await db.query(`SELECT sha, rows FROM air_quality_imports`);
    assert.deepEqual(imports, [{ sha: "sha-2", rows: 1 }]);

    // The ЖК card finds the imported station through the stations table.
    const station = await db.query(`SELECT name, origin FROM air_quality_stations WHERE station_id = 'ag-500'`);
    assert.equal(station[0].origin, "AirGradient");
    const coverage = await aggregates().getCoverage();
    assert.equal(coverage.stations, 1);
    assert.equal(coverage.totalRows, 3);

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
