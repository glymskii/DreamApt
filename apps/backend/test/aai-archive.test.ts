import { strict as assert } from "node:assert";
import {
  AaiMonthBuilder,
  STUCK_RUN_HOURS,
  cleanSeries,
  parseCsvLine,
  stationIdFor,
} from "../src/air-quality/aai-archive";

/** Parsing and cleaning of the Almaty Air Initiative dataset — no DB. */

// CSV fields: quotes, commas inside quotes, escaped quotes, empty fields.
assert.deepEqual(parseCsvLine(`a,"b, c","say ""hi""",,1.5`), ["a", "b, c", 'say "hi"', "", "1.5"]);

// Station ids line up with the live feeds.
assert.equal(stationIdFor("airgradient", "166942"), "ag-166942");
assert.equal(stationIdFor("airkaz", "108"), "108");
assert.equal(stationIdFor("iqair", "0464e9"), "iq-0464e9");
assert.equal(stationIdFor("waqi", "1348123"), "waqi-1348123");

// Spike: a lone 483 among 10s goes; a winter evening ramp stays.
{
  const s = new Map<number, number>();
  [10, 12, 11, 483, 13, 12, 11].forEach((v, i) => s.set(i, v));
  assert.deepEqual(cleanSeries(s), { stuck: 0, spikes: 1 });
  assert.equal(s.has(3), false);

  const ramp = new Map<number, number>();
  [40, 60, 90, 130, 150, 160, 155].forEach((v, i) => ramp.set(i, v));
  assert.deepEqual(cleanSeries(ramp), { stuck: 0, spikes: 0 });

  // Two bad hours in a row are both caught.
  const pair = new Map<number, number>();
  [8, 9, 8, 300, 310, 9, 8, 9].forEach((v, i) => pair.set(i, v));
  assert.equal(cleanSeries(pair).spikes, 2);
}

// Stuck sensor: a full day of one value is dropped; a gap breaks the run.
{
  const s = new Map<number, number>();
  for (let i = 0; i < STUCK_RUN_HOURS; i++) s.set(i, 7);
  s.set(STUCK_RUN_HOURS, 9);
  assert.deepEqual(cleanSeries(s), { stuck: STUCK_RUN_HOURS, spikes: 0 });
  assert.deepEqual([...s.keys()], [STUCK_RUN_HOURS]);

  const gap = new Map<number, number>();
  for (let i = 0; i < STUCK_RUN_HOURS + 2; i++) if (i !== 10) gap.set(i, 7);
  assert.equal(cleanSeries(gap).stuck, 0);
}

// Builder over the 2026 layout: validity, bounds, quoting, day folding.
{
  const b = new AaiMonthBuilder();
  const lines = [
    `"origin","source","name","datetime","id","pm25","aqi_pm25","pm10","no2","lat","lon","region","district","district_ru","is_valid"`,
    `AirGradient,airgradient,"Almaty Arena",2026-09-01 00:00:00.000,"166943",6.0,33.0,6.0,,43.262987,76.8193,Алматы,Алатау ауданы,Алатауский район,true`,
    `AirGradient,airgradient,"Almaty Arena",2026-09-01 01:00:00.000,"166943",8.04,33.0,6.0,,43.262987,76.8193,Алматы,Алатау ауданы,Алатауский район,true`,
    `AirGradient,airgradient,"Almaty Arena",2026-09-01 23:00:00.000,"166943",9,33.0,6.0,,43.262987,76.8193,Алматы,Алатау ауданы,Алатауский район,true`,
    `AirGradient,airgradient,"Almaty Arena",2026-09-02 00:00:00.000,"166943",11,33.0,6.0,,43.262987,76.8193,Алматы,Алатау ауданы,Алатауский район,true`,
    // Mirror of an AirKaz station via WAQI — the dataset marks it invalid.
    `AirKaz.org,waqi,"Жана Кайрат, Турксибский район, Kazakhstan",2026-09-01 00:00:00.000,"114514",7.9,44.0,10.1,,43.312,77.001,Алматы,Түрксіб ауданы,Турксибский район,false`,
    // Outside Almaty, no PM2.5, implausible value.
    `AirGradient,airgradient,"Far away",2026-09-01 00:00:00.000,"1",5,,,,44.5,76.9,,,,true`,
    `AirGradient,airgradient,"Silent",2026-09-01 00:00:00.000,"2",,,,,43.2,76.9,,,,true`,
    `AirGradient,airgradient,"Broken",2026-09-01 00:00:00.000,"3",4000,,,,43.2,76.9,,,,True`,
    ``,
  ];
  lines.forEach((l) => b.addLine(l));
  const out = b.finish();

  assert.deepEqual(b.stats, { rows: 8, invalid: 1, unusable: 3, stuck: 0, spikes: 0, kept: 4 });
  assert.equal(out.firstDay, "2026-09-01");
  assert.equal(out.lastDay, "2026-09-02");
  assert.equal(out.rows.length, 2);
  const d1 = out.rows.find((r) => r.day === "2026-09-01")!;
  assert.equal(d1.stationId, "ag-166943");
  assert.equal(d1.hours, 3);
  assert.equal(d1.pm25.length, 24);
  assert.equal(d1.pm25[0], 6);
  assert.equal(d1.pm25[1], 8, "rounded to 0.1");
  assert.equal(d1.pm25[2], null);
  assert.equal(d1.pm25[23], 9);
  assert.deepEqual(out.stations, [
    {
      stationId: "ag-166943",
      name: "Almaty Arena",
      lat: 43.262987,
      lng: 76.8193,
      origin: "AirGradient",
      district: "Алатауский район",
    },
  ]);
}

// The 2025 layout: other columns, other order, "True" — same result.
{
  const b = new AaiMonthBuilder();
  b.addLine("origin,source,name,datetime,id,pm25,pm10,no2,so2,co,lat,lon,district_ru,is_valid,year,month,date,hour,is_weekend");
  b.addLine("AirGradient,airgradient,№178 mektep,2025-10-01 05:00:00,167594,5.0,5.0,,,,43.249789,76.814599,Алатауский район,True,2025,10,2025-10-01,5,False\r");
  const out = b.finish();
  assert.equal(out.rows[0].stationId, "ag-167594");
  assert.equal(out.rows[0].pm25[5], 5);
}

// A header without the columns we need is an error, not silent garbage.
assert.throws(() => new AaiMonthBuilder().addLine("datetime,PM2_5,station"), /missing column/);

console.log("aai archive: ok");
