/**
 * IDW (Inverse Distance Weighted) interpolation for PM 2.5 air quality.
 *
 * Each cell of a grid over Almaty gets a PM 2.5 value interpolated from the
 * K nearest real stations using `value = Σ(pm25_i / d_i^p) / Σ(1 / d_i^p)`.
 *
 * The grid is painted into a small image that MapLibre stretches over the
 * city with linear resampling: a smooth field instead of overlapping blurred
 * circles (which streaked, as the old grid's cells were 1.5 km wide but
 * only 0.9 km tall). Cells far from every sensor fade out rather than
 * extrapolating one reading across the mountains.
 */

import { classifyPm25 } from "./pm25";

export interface RealStation {
  lat: number;
  lng: number;
  pm25: number;
}

// Almaty bounds (matches backend filter)
const ALMATY_BOUNDS = {
  minLat: 43.0,
  maxLat: 43.5,
  minLng: 76.4,
  maxLng: 77.5,
};

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
  return idw(topKNearest(lat, lng, stations, Math.min(k, stations.length)), power);
}

function idw(top: Array<{ station: RealStation; dist: number }>, power: number = 2): number {
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

/** Image corners for a MapLibre image source: TL, TR, BR, BL. */
export const FIELD_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [ALMATY_BOUNDS.minLng, ALMATY_BOUNDS.maxLat],
  [ALMATY_BOUNDS.maxLng, ALMATY_BOUNDS.maxLat],
  [ALMATY_BOUNDS.maxLng, ALMATY_BOUNDS.minLat],
  [ALMATY_BOUNDS.minLng, ALMATY_BOUNDS.minLat],
];

/** A transparent pixel: the field when there is nothing honest to draw. */
export const EMPTY_FIELD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Square cells on the ground at Almaty's latitude. */
const CELL_KM = 0.75;
/** Fully drawn this close to a sensor, gone at FADE_KM. */
const SOLID_KM = 2;
const FADE_KM = 5;

/**
 * Paint the interpolated field into a PNG data URL for FIELD_COORDINATES.
 *
 * Performance: ~120×75 cells × top-8 selection over a few hundred stations
 * runs in a few tens of milliseconds; memoize on the station list.
 */
export function renderPm25Field(stations: RealStation[], k: number = 8): string {
  if (stations.length === 0) return EMPTY_FIELD;

  const { minLat, maxLat, minLng, maxLng } = ALMATY_BOUNDS;
  const kmPerLng = 111.32 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const rows = Math.round(((maxLat - minLat) * 111.32) / CELL_KM);
  const cols = Math.round(((maxLng - minLng) * kmPerLng) / CELL_KM);

  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return EMPTY_FIELD;
  const image = ctx.createImageData(cols, rows);

  for (let r = 0; r < rows; r++) {
    // Row 0 is the northern edge.
    const lat = maxLat - ((r + 0.5) * (maxLat - minLat)) / rows;
    for (let c = 0; c < cols; c++) {
      const lng = minLng + ((c + 0.5) * (maxLng - minLng)) / cols;
      const top = topKNearest(lat, lng, stations, Math.min(k, stations.length));
      const nearest = top.reduce((m, x) => Math.min(m, x.dist), Infinity);
      if (nearest >= FADE_KM) continue;
      const alpha = nearest <= SOLID_KM ? 1 : (FADE_KM - nearest) / (FADE_KM - SOLID_KM);
      const [red, green, blue] = classifyPm25(idw(top)).rgb;
      const i = (r * cols + c) * 4;
      image.data[i] = red;
      image.data[i + 1] = green;
      image.data[i + 2] = blue;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
