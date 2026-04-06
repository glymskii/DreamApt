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
 * Risk thresholds (on effective distance):
 *   <200m  = critical ("На разломе")
 *   <500m  = high ("Опасная зона")
 *   <1200m = moderate ("Зона внимания")
 *   <3000m = low ("Умеренный риск")
 *   >3000m = safe ("Безопасная зона")
 */
export function findNearestFault(
  lat: number,
  lng: number,
): FaultProximityResult {
  let bestEffectiveDistance = Infinity;
  let bestRawDistance = Infinity;
  let bestFault: FaultLine | null = null;

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
  }

  const distanceMeters = Math.round(bestRawDistance);

  // Relaxed thresholds — Almaty is a seismically active city,
  // most buildings are built to seismic codes. Only flag truly close proximity.
  let riskLevel: FaultProximityResult["riskLevel"];
  let riskLabel: string;
  let riskColor: string;

  if (bestEffectiveDistance < 200) {
    riskLevel = "critical";
    riskLabel = "На разломе";
    riskColor = "#dc2626"; // red
  } else if (bestEffectiveDistance < 500) {
    riskLevel = "high";
    riskLabel = "Опасная зона";
    riskColor = "#f97316"; // orange
  } else if (bestEffectiveDistance < 1200) {
    riskLevel = "moderate";
    riskLabel = "Зона внимания";
    riskColor = "#eab308"; // yellow
  } else if (bestEffectiveDistance < 3000) {
    riskLevel = "low";
    riskLabel = "Умеренный риск";
    riskColor = "#84cc16"; // lime
  } else {
    riskLevel = "safe";
    riskLabel = "Безопасная зона";
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
    riskLevel,
    riskLabel,
    riskColor,
  };
}
