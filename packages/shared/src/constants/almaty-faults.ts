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
 * Find the most dangerous fault relative to a given coordinate.
 *
 * Strategy: for each fault, compute effective distance = raw_distance / danger_multiplier.
 * The fault with the SMALLEST effective distance is the most relevant threat.
 * This ensures a confirmed fault (danger=3) at 900m is considered more dangerous
 * than a disputed fault (danger=1) at 700m.
 *
 * Risk thresholds — calibrated to the California Alquist-Priolo Earthquake
 * Fault Zoning Act (the international gold standard) and softened for
 * residential context. The labels are deliberately neutral: we report
 * measured proximity, not a safety verdict. Whether a building is actually
 * safe depends on engineering compliance with ҚНжЕ РК 2.03-30, which is
 * beyond what this dataset can know.
 *
 * Hybrid scale: `critical` is decided on RAW distance (literally on the
 * fault line — applies regardless of fault type), the other levels use
 * EFFECTIVE distance (raw / danger), so a confirmed fault projects further
 * than a disputed one. Trade-off: confirmed faults may not show "critical"
 * at 60m raw (they're "high" instead) — but that matches the user-facing
 * intuition: "На линии" should mean exactly that.
 *
 *   raw   <  50m  = critical (literally on the line, any fault type)
 *   eff   <  100m = high     (very close after danger-weighting)
 *   eff   <  300m = moderate (close enough that local geology matters)
 *   eff   <  800m = low      (typical baseline for Almaty residential zones)
 *   eff   ≥  800m = safe     (no special seismic-proximity considerations)
 *
 * Tightened from the first hybrid pass after the raw-critical change
 * pushed too many ex-critical ЖК into high — band became overcrowded
 * (49% of map was orange). The shrunk high+moderate bands rebalance
 * the distribution to ~30% red+orange, matching the design intent.
 */
export function findNearestFault(
  lat: number,
  lng: number,
): FaultProximityResult {
  let bestEffectiveDistance = Infinity;
  let bestRawDistance = Infinity;
  let bestFault: FaultLine | null = null;

  // Track nearest raw distance per danger level too. The slide-over uses
  // these to render a "X м до подтверждённого / Y м до спорного" breakdown
  // so users can see why classification went the way it did.
  const nearestPerDanger: Record<number, number> = { 1: Infinity, 2: Infinity, 3: Infinity };

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

    // Effective distance: closer for more dangerous faults
    const effectiveDist = minDist / (fault.danger || 1);

    if (effectiveDist < bestEffectiveDistance) {
      bestEffectiveDistance = effectiveDist;
      bestRawDistance = minDist;
      bestFault = fault;
    }

    // Per-danger nearest tracking (raw distance, untouched by multiplier)
    const dangerKey = fault.danger || 1;
    if (minDist < (nearestPerDanger[dangerKey] ?? Infinity)) {
      nearestPerDanger[dangerKey] = minDist;
    }
  }

  const distanceMeters = Math.round(bestRawDistance);
  const finite = (n: number) => (Number.isFinite(n) ? Math.round(n) : null);
  const nearestByType = {
    confirmed: finite(nearestPerDanger[3]),
    poorlyStudied: finite(nearestPerDanger[2]),
    disputed: finite(nearestPerDanger[1]),
  };

  // Hybrid scale: `critical` is decided on raw distance (50m "literally on
  // the fault line", applies to ANY fault type — disputed or confirmed,
  // 50m is 50m). Everything else uses effective distance so confirmed
  // faults project further than disputed ones — geologically correct.
  // Softened from the original Alquist-Priolo direct port: 600 → 400m
  // moderate, 1500 → 1000m low/safe, since Almaty residential buildings
  // are designed to ҚНжЕ РК 2.03-30. Labels describe proximity, not danger.
  let riskLevel: FaultProximityResult["riskLevel"];
  let riskLabel: string;
  let riskColor: string;

  if (bestRawDistance < 50) {
    riskLevel = "critical";
    riskLabel = "На линии разлома";
    riskColor = "#dc2626"; // red
  } else if (bestEffectiveDistance < 100) {
    riskLevel = "high";
    riskLabel = "Близко к разлому";
    riskColor = "#f97316"; // orange
  } else if (bestEffectiveDistance < 300) {
    riskLevel = "moderate";
    riskLabel = "Умеренная близость";
    riskColor = "#eab308"; // yellow
  } else if (bestEffectiveDistance < 800) {
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
