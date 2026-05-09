/**
 * Seismic fault lines data for Almaty.
 * Source: Shutov-Tikhonov interactive fault map (shutov.kz/maps)
 *
 * Danger levels:
 *   3 — "confirmed" (red) - documented on multiple geological maps
 *   2 — "poorly_studied" (orange) - limited data sources
 *   1 — "disputed" (grey) - present on some maps, absent on others
 */

import faultData from "./almaty-faults.json";

export interface FaultLine {
  name: string;
  level: "confirmed" | "poorly_studied" | "disputed" | "unknown";
  label: string;
  danger: number; // 1-3
  coordinates: [number, number][]; // [lat, lng] pairs
}

export interface FaultProximityResult {
  distanceMeters: number;
  nearestFault: {
    name: string;
    level: string;
    label: string;
    danger: number;
  };
  /** Per-danger-level nearest distances. Lets the UI show "X м до
   *  подтверждённого, Y м до спорного" so users can decode why the risk
   *  label is what it is — without having to understand the danger
   *  multiplier. Null if no fault of that type within the dataset. */
  nearestByType: {
    confirmed: number | null;   // danger=3
    poorlyStudied: number | null; // danger=2
    disputed: number | null;    // danger=1
  };
  riskLevel: "critical" | "high" | "moderate" | "low" | "safe";
  riskLabel: string;
  riskColor: string;
}

export const FAULT_LINES: FaultLine[] = (faultData as any).faultLines;
export const FAULT_ZONES: FaultLine[] = (faultData as any).faultZones;

/** Haversine distance in meters between two points */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance from a point to a line segment (flat-earth approx for short distances) */
function distanceToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const latScale = 111320;
  const lngScale = 111320 * Math.cos((pLat * Math.PI) / 180);

  const px = (pLng - aLng) * lngScale;
  const py = (pLat - aLat) * latScale;
  const bx = (bLng - aLng) * lngScale;
  const by = (bLat - aLat) * latScale;

  const dot = px * bx + py * by;
  const lenSq = bx * bx + by * by;
  let t = lenSq > 0 ? dot / lenSq : 0;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return haversineMeters(pLat, pLng, projLat, projLng);
}

/**
 * Find the nearest CONFIRMED fault relative to a given coordinate, plus
 * supplementary distances to nearest poorly-studied and disputed faults
 * (info-only — these don't influence classification).
 *
 * Risk thresholds aligned to the California Alquist-Priolo Earthquake
 * Fault Zoning Act on RAW distance to the nearest confirmed fault. The
 * labels are deliberately neutral: we report measured proximity, not a
 * safety verdict. Whether a building is actually safe depends on
 * engineering compliance with ҚНжЕ РК 2.03-30.
 *
 * The classification looks ONLY at confirmed faults (danger=3) — these
 * are the ones documented across multiple geological maps and trustworthy
 * enough to drive a public-facing label. Poorly-studied (danger=2) and
 * disputed (danger=1) faults still get measured and surfaced in the UI
 * breakdown for transparency, but they don't move the badge color.
 *
 *   raw < 50m   = critical (Alquist-Priolo "no-build")
 *   raw < 200m  = high     (Alquist-Priolo "study zone")
 *   raw < 600m  = moderate
 *   raw < 1500m = low      (typical Almaty residential baseline)
 *   raw ≥ 1500m = safe
 *
 * Earlier iterations used an "effective distance" formula (raw / danger)
 * that let disputed faults push the classification — confusing UX, since
 * a 334m disputed fault would label a ЖК as "moderate" while the nearest
 * confirmed fault was 4.5km away. Moving to confirmed-only matches user
 * intuition: the badge reflects only the data we trust most.
 */
export function findNearestFault(
  lat: number,
  lng: number,
): FaultProximityResult {
  // Track nearest raw distance per danger level. Classification uses the
  // confirmed (danger=3) row exclusively; the others travel along as
  // supplementary info for the UI breakdown.
  const nearestPerDanger: Record<number, number> = { 1: Infinity, 2: Infinity, 3: Infinity };
  const nearestFaultPerDanger: Record<number, FaultLine | null> = { 1: null, 2: null, 3: null };

  const allFaults = [...FAULT_LINES, ...FAULT_ZONES];

  for (const fault of allFaults) {
    const coords = fault.coordinates;
    let minDist = Infinity;

    // Check distance to each segment
    for (let i = 0; i < coords.length - 1; i++) {
      const [aLat, aLng] = coords[i];
      const [bLat, bLng] = coords[i + 1];
      const dist = distanceToSegment(lat, lng, aLat, aLng, bLat, bLng);
      if (dist < minDist) minDist = dist;
    }

    // Also check individual points
    for (const [pLat, pLng] of coords) {
      const dist = haversineMeters(lat, lng, pLat, pLng);
      if (dist < minDist) minDist = dist;
    }

    const dangerKey = fault.danger || 1;
    if (minDist < (nearestPerDanger[dangerKey] ?? Infinity)) {
      nearestPerDanger[dangerKey] = minDist;
      nearestFaultPerDanger[dangerKey] = fault;
    }
  }

  // Confirmed fault drives the classification AND the headline distance.
  // If the dataset somehow contains no confirmed fault near this point,
  // bestRawDistance stays Infinity and we fall through to "safe" below.
  const bestRawDistance = nearestPerDanger[3];
  const bestFault = nearestFaultPerDanger[3];

  const finite = (n: number) => (Number.isFinite(n) ? Math.round(n) : null);
  const distanceMeters = finite(bestRawDistance) ?? 0;
  const nearestByType = {
    confirmed: finite(nearestPerDanger[3]),
    poorlyStudied: finite(nearestPerDanger[2]),
    disputed: finite(nearestPerDanger[1]),
  };

  // Classification on RAW distance to the nearest CONFIRMED fault only.
  // Aligned with the Alquist-Priolo Earthquake Fault Zoning Act bands
  // (50ft no-build, 660ft study zone — softened to 50m / 200m here for
  // residential context). Buildings beyond ~1.5km from any confirmed
  // fault sit in the city's standard seismic baseline; nothing further
  // out warrants a special label.
  let riskLevel: FaultProximityResult["riskLevel"];
  let riskLabel: string;
  let riskColor: string;

  if (bestRawDistance < 50) {
    riskLevel = "critical";
    riskLabel = "На линии разлома";
    riskColor = "#dc2626"; // red
  } else if (bestRawDistance < 200) {
    riskLevel = "high";
    riskLabel = "Близко к разлому";
    riskColor = "#f97316"; // orange
  } else if (bestRawDistance < 600) {
    riskLevel = "moderate";
    riskLabel = "Умеренная близость";
    riskColor = "#eab308"; // yellow
  } else if (bestRawDistance < 1500) {
    riskLevel = "low";
    riskLabel = "Стандартный риск города";
    riskColor = "#84cc16"; // lime
  } else {
    riskLevel = "safe";
    riskLabel = "Минимальный риск";
    riskColor = "#16a34a"; // dark green
  }

  return {
    distanceMeters,
    nearestFault: bestFault
      ? {
          name: bestFault.name,
          level: bestFault.level,
          label: bestFault.label,
          danger: bestFault.danger,
        }
      : { name: "Неизвестно", level: "unknown", label: "Неизвестно", danger: 0 },
    nearestByType,
    riskLevel,
    riskLabel,
    riskColor,
  };
}
