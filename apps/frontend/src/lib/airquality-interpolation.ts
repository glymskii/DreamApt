/**
 * IDW (Inverse Distance Weighted) interpolation for PM 2.5 air quality.
 *
 * Generates a virtual grid of points covering Almaty bounds where each point's
 * PM 2.5 value is interpolated from the K nearest real stations using
 * `value = Σ(pm25_i / d_i^p) / Σ(1 / d_i^p)`.
 *
 * Output is a list of points (with color) suitable for rendering as a circle
 * layer with circle-blur — produces a smooth heatmap-like field that has
 * coverage everywhere instead of gaps between sensors.
 */

export interface RealStation {
  lat: number;
  lng: number;
  pm25: number;
}

export interface GridPoint {
  lat: number;
  lng: number;
  pm25: number;
  color: string;
}

// Almaty bounds (matches backend filter)
const ALMATY_BOUNDS = {
  minLat: 43.0,
  maxLat: 43.5,
  minLng: 76.4,
  maxLng: 77.5,
};

// PM 2.5 → color (matches backend AirKazService.classifyPm25)
function pm25Color(pm25: number): string {
  if (pm25 < 12) return "#22c55e";       // good
  if (pm25 < 35.5) return "#eab308";      // moderate
  if (pm25 < 55.5) return "#f97316";      // sensitive
  if (pm25 < 150.5) return "#dc2626";     // unhealthy
  if (pm25 < 250.5) return "#9f1239";     // very unhealthy
  return "#7c2d12";                       // hazardous
}

/**
 * Approx distance in km between two lat/lng points using equirectangular
 * projection (good enough for sub-100km within a city, much faster than
 * full haversine — we run this 60×60×8 times per grid recompute).
 */
function approxDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const x = ((lng2 - lng1) * Math.PI) / 180 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  const y = ((lat2 - lat1) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * R;
}

/**
 * Top-K selection without sorting the whole list (O(n*k) instead of O(n log n)).
 * For our case (n=384 stations, k=8) this is ~3000 ops vs ~3500 ops with sort,
 * but we avoid allocating a sorted copy.
 */
function topKNearest(
  lat: number,
  lng: number,
  stations: RealStation[],
  k: number,
): Array<{ station: RealStation; dist: number }> {
  const top: Array<{ station: RealStation; dist: number }> = [];
  let maxDistInTop = Infinity;

  for (const s of stations) {
    const d = approxDistanceKm(lat, lng, s.lat, s.lng);
    if (top.length < k) {
      top.push({ station: s, dist: d });
      if (top.length === k) {
        // initial fill — find current max
        maxDistInTop = top.reduce((m, x) => (x.dist > m ? x.dist : m), 0);
      }
    } else if (d < maxDistInTop) {
      // replace the current worst
      let worstIdx = 0;
      let worstDist = top[0].dist;
      for (let i = 1; i < top.length; i++) {
        if (top[i].dist > worstDist) {
          worstDist = top[i].dist;
          worstIdx = i;
        }
      }
      top[worstIdx] = { station: s, dist: d };
      // recompute new max
      maxDistInTop = top.reduce((m, x) => (x.dist > m ? x.dist : m), 0);
    }
  }
  return top;
}

/**
 * Interpolate PM 2.5 at a single (lat,lng) using IDW from top-K nearest stations.
 * - power = 2 (classic IDW; squared inverse distance)
 * - if a station is essentially "on top" of the query point (<50m), use its value directly
 *
 * Returns null if there are no stations.
 */
export function interpolatePm25(
  lat: number,
  lng: number,
  stations: RealStation[],
  k: number = 8,
  power: number = 2,
): number | null {
  if (stations.length === 0) return null;

  const top = topKNearest(lat, lng, stations, Math.min(k, stations.length));

  // Direct hit: a station is right on the query point
  for (const { station, dist } of top) {
    if (dist < 0.05) return station.pm25; // < 50m
  }

  let weightSum = 0;
  let valueSum = 0;
  for (const { station, dist } of top) {
    const w = 1 / Math.pow(dist, power);
    weightSum += w;
    valueSum += station.pm25 * w;
  }
  return valueSum / weightSum;
}

/**
 * Generate a uniform grid of interpolated PM 2.5 points covering Almaty.
 *
 * @param stations real sensor readings
 * @param cols grid columns (longitude direction)
 * @param rows grid rows (latitude direction)
 * @param k number of nearest neighbors to use in IDW (default 8)
 * @returns array of grid points with interpolated pm25 + color
 *
 * Performance: at 60×60 = 3600 cells × top-8 selection over 384 stations
 * this runs in ~30-50ms in modern browsers. Memoize via useMemo on
 * stations identity.
 */
export function generateInterpolatedGrid(
  stations: RealStation[],
  cols: number = 60,
  rows: number = 60,
  k: number = 8,
): GridPoint[] {
  if (stations.length === 0) return [];

  const { minLat, maxLat, minLng, maxLng } = ALMATY_BOUNDS;
  const stepLat = (maxLat - minLat) / rows;
  const stepLng = (maxLng - minLng) / cols;

  const out: GridPoint[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = minLat + (r + 0.5) * stepLat;
    for (let c = 0; c < cols; c++) {
      const lng = minLng + (c + 0.5) * stepLng;
      const pm25 = interpolatePm25(lat, lng, stations, k);
      if (pm25 === null) continue;
      out.push({
        lat,
        lng,
        pm25,
        color: pm25Color(pm25),
      });
    }
  }
  return out;
}
