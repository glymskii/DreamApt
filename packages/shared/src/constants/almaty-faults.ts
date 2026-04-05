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

/** Haversine distance in meters between two points */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate minimum distance from a point to a line segment.
 * Returns distance in meters.
 */
function distanceToSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  // Project point onto line segment using flat-earth approximation
  // (acceptable for short segments within a city)
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const dx = (bLng - aLng) * cosLat;
  const dy = bLat - aLat;
  const px = (pLng - aLng) * cosLat;
  const py = pLat - aLat;

  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return haversineMeters(pLat, pLng, aLat, aLng);
  }

  let t = (px * dx + py * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return haversineMeters(pLat, pLng, projLat, projLng);
}

/**
 * Find the nearest fault line to a given coordinate.
 * Returns distance in meters and fault info.
 */
export function findNearestFault(
  lat: number,
  lng: number,
): FaultProximityResult {
  let minDistance = Infinity;
  let nearestFault: FaultLine | null = null;

  for (const fault of FAULT_LINES) {
    const coords = fault.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const [aLat, aLng] = coords[i];
      const [bLat, bLng] = coords[i + 1];
      const dist = distanceToSegment(lat, lng, aLat, aLng, bLat, bLng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestFault = fault;
      }
    }
    // Also check distance to individual points
    for (const [pLat, pLng] of coords) {
      const dist = haversineMeters(lat, lng, pLat, pLng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestFault = fault;
      }
    }
  }

  const distanceMeters = Math.round(minDistance);

  // Determine risk level based on distance AND fault danger level
  const dangerMultiplier = nearestFault?.danger ?? 1;
  const effectiveDistance = distanceMeters / dangerMultiplier;

  let riskLevel: FaultProximityResult["riskLevel"];
  let riskLabel: string;
  let riskColor: string;

  if (effectiveDistance < 100) {
    riskLevel = "critical";
    riskLabel = "На разломе";
    riskColor = "#dc2626"; // red
  } else if (effectiveDistance < 300) {
    riskLevel = "high";
    riskLabel = "Опасная зона";
    riskColor = "#f97316"; // orange
  } else if (effectiveDistance < 700) {
    riskLevel = "moderate";
    riskLabel = "Зона внимания";
    riskColor = "#eab308"; // yellow
  } else if (effectiveDistance < 1500) {
    riskLevel = "low";
    riskLabel = "Умеренный риск";
    riskColor = "#22c55e"; // green
  } else {
    riskLevel = "safe";
    riskLabel = "Безопасная зона";
    riskColor = "#16a34a"; // dark green
  }

  return {
    distanceMeters,
    nearestFault: nearestFault
      ? {
          name: nearestFault.name,
          level: nearestFault.level,
          label: nearestFault.label,
          danger: nearestFault.danger,
        }
      : { name: "Неизвестно", level: "unknown", label: "Неизвестно", danger: 0 },
    riskLevel,
    riskLabel,
    riskColor,
  };
}
