import "reflect-metadata";
import { strict as assert } from "node:assert";
import { AirKazService } from "../src/air-quality/airkaz.service";

async function main() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AAI_API_KEY;
  const now = new Date().toISOString();
  try {
    process.env.AAI_API_KEY = "test-key";
    globalThis.fetch = (async (url: string) => {
      if (url.includes("backend.air.org.kz")) {
        return Response.json({ data: [{ location_id: 123, location_name: "Test", latitude: 43.25,
          longitude: 76.95, pm25_avg: 0, last_measurement: now }] });
      }
      if (url.includes("api.air.org.kz")) throw new Error("TLS unavailable");
      if (url.includes("airkaz.org")) return new Response(`var sensors_data = ${JSON.stringify([
        { id: 9, city: "Алматы", lat: 43.174, lng: 76.917, pm25: 12, date: now },
      ])};`);
      if (url.includes("api.airgradient.com")) return Response.json([
        { locationId: 166942, locationName: "school-8", publicLocationName: "Talǵar, №8 mektep",
          latitude: 43.2938, longitude: 77.2347, offline: false, pm02: 5.6, pm10: 6.5, atmp: 16.9, rhum: 37, timestamp: now },
        { locationId: 1, latitude: 43.25, longitude: 76.9, offline: true, pm02: 10, timestamp: now },
        { locationId: 2, latitude: 51.13, longitude: 71.43, offline: false, pm02: 10, timestamp: now },
        { locationId: 3, latitude: 43.24, longitude: 76.91, offline: false, pm02: null, timestamp: now },
        { locationId: 4, latitude: 43.23, longitude: 76.92, offline: false, pm02: 12, timestamp: "2026-01-01T00:00:00.000Z" },
      ]);
      return Response.json([{ sensor: { id: 78340 }, location: { latitude: 43.2474, longitude: 76.9569, indoor: 0 },
        timestamp: now, sensordatavalues: [{ value_type: "P2", value: "14" }] }]);
    }) as typeof fetch;
    const primary = await new AirKazService({} as any).getStationsDetailed({ forceRefresh: true });
    assert.equal(primary.source, "backend.air.org.kz");
    assert.equal(primary.stations[0].pm25, 0);
    assert.equal(primary.stations[0].id, "map-123");
    delete process.env.AAI_API_KEY;
    const fallback = await new AirKazService({} as any).getStationsDetailed({ forceRefresh: true });
    assert.equal(fallback.stations.length, 3, "All independent fallback networks must contribute");
    assert.equal(fallback.source, "mixed");
    const ag = fallback.stations.find(s => s.origin === "AirGradient");
    assert.ok(ag, "AirGradient public feed is a fallback");
    assert.equal(ag!.id, "ag-166942");
    assert.equal(ag!.name, "Talǵar, №8 mektep");
    assert.equal(ag!.pm25, 5.6);
    assert.equal(fallback.stations.filter(s => s.origin === "AirGradient").length, 1,
      "offline, out-of-town, PM-less and stale monitors are skipped");
    assert.ok(fallback.stations.every(s => s.date.endsWith("Z")));
    const validator = new AirKazService({} as any) as any;
    assert.equal(validator.isUsable(43.25, 76.95, 10, "invalid"), false);
    assert.equal(validator.isUsable(43.25, 76.95, 10, ""), false);
    assert.equal(validator.timestamp("2026-10-07 11:00:00", "+05:00"), "2026-10-07T06:00:00.000Z");
    assert.equal(validator.timestamp("2026-10-07 06:00:00", "Z"), "2026-10-07T06:00:00.000Z");
    validator.cache = { result: { stations: primary.stations, source: "archive", stale: true, asOf: now }, fetchedAt: Date.now() };
    const noArchive = await validator.getStationsDetailed({ allowArchiveFallback: false });
    assert.equal(noArchive.stale, false, "Recorder must not reuse cached archive snapshots");
    console.log("Air quality regression tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AAI_API_KEY;
    else process.env.AAI_API_KEY = originalKey;
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
