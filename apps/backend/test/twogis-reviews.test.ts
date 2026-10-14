import "reflect-metadata";
import { strict as assert } from "node:assert";
import { TwoGisReviewsService } from "../src/properties/twogis-reviews.service";

/** Catalog items shaped like 2GIS's October 2026 answers. */
const item = (id: string, type: string, name: string, count: number, rating = 4, point = { lat: 43.201, lon: 76.901 }) => ({
  id: `${id}_hash`,
  type,
  name,
  point,
  reviews: { general_rating: rating, general_review_count: count },
});
const review = (id: string, date: string, text = "Отличный двор, тихо") => ({
  id,
  rating: 5,
  text,
  date_created: date,
  user: { name: `user-${id}` },
  photos: [],
});

const CATALOG: Record<string, unknown[]> = {
  "magnit alatau": [
    item("100", "branch", "Magnit Alatau, строящийся жилой комплекс", 60, 4.5),
    item("101", "branch", "Magnit Alatau, строящийся жилой комплекс", 23, 3.5),
    item("102", "building", "Magnit Alatau, жилой комплекс", 1, 5),
    item("103", "adm_div", "Жилой комплекс Magnit Alatau", 0),
    item("104", "branch", "Neo Park, строящийся жилой комплекс", 16),
    // Someone else's complex: its name must not count as a match.
    item("105", "adm_div", "Жилой комплекс Neo Park", 40),
    // Same name, 25 km away: another complex.
    item("106", "adm_div", "Жилой комплекс Magnit Alatau", 9, 4, { lat: 43.0, lon: 77.1 }),
  ],
  "alatau city 2.0": [
    item("200", "adm_div", "Жилой комплекс Alatau City 2.0", 2),
    item("201", "building", "Alatau City, жилой комплекс", 30),
    item("202", "building", "микрорайон Дарабоз, 25", 10),
  ],
};

const REVIEWS: Record<string, unknown[]> = {
  "branches/100": [review("a1", "2026-10-11T10:00:00+05:00"), review("a2", "2026-09-01T10:00:00+05:00"),
    review("a3", "2026-08-01T10:00:00+05:00", "5")],
  "branches/101": [review("b1", "2026-09-15T10:00:00+05:00"), review("a2", "2026-09-01T10:00:00+05:00")],
  "geo/102": [review("c1", "2026-10-09T10:00:00+05:00")],
  "geo/105": [review("x1", "2026-10-12T10:00:00+05:00")],
  "geo/106": [review("x4", "2026-10-13T10:00:00+05:00")],
  "branches/104": [review("x2", "2026-10-12T10:00:00+05:00")],
  "geo/200": [review("d1", "2026-05-21T10:00:00+05:00")],
  "geo/201": [review("x3", "2026-10-12T10:00:00+05:00")],
};

async function main() {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("catalog.api.2gis.com")) {
      const q = new URL(url).searchParams.get("q")!.toLowerCase();
      const key = Object.keys(CATALOG).find((k) => q.includes(k));
      return Response.json({ result: { items: key ? CATALOG[key] : [] } });
    }
    const m = url.match(/2\.0\/(geo|branches)\/(\d+)\/reviews/);
    if (m) {
      requested.push(`${m[1]}/${m[2]}`);
      return Response.json({ reviews: REVIEWS[`${m[1]}/${m[2]}`] || [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  try {
    const service = new TwoGisReviewsService();

    // Reviews from the sales office, the second office and a building,
    // merged newest first; another complex's objects stay out.
    const magnit = await service.getReviews("ЖК Magnit Alatau", 43.2, 76.9);
    assert.ok(magnit);
    assert.deepEqual(magnit.reviews.map((r) => r.id), ["a1", "c1", "b1", "a2"]);
    assert.equal(magnit.totalReviews, 84);
    assert.equal(Math.round(magnit.averageRating * 10) / 10, 4.2, "weighted by review count");
    assert.ok(!requested.includes("geo/105") && !requested.includes("branches/104"));
    assert.ok(!requested.includes("geo/103"), "objects without reviews aren't read");
    assert.ok(!requested.includes("geo/106"), "a same-named complex 25 km away stays out");

    // An exact name match keeps «Alatau City» out of «Alatau City 2.0».
    requested.length = 0;
    const alatau = await service.getReviews("Alatau City 2.0");
    assert.ok(alatau);
    assert.deepEqual(alatau.reviews.map((r) => r.id), ["d1"]);
    assert.equal(alatau.totalReviews, 2);
    assert.deepEqual(requested, ["geo/200"]);

    console.log("2GIS reviews tests passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
