/**
 * PM 2.5 bands: Kazakhstan's daily ПДК scale, the same thresholds and
 * colours as the backend's AirKazService.classifyPm25. Live stations come
 * pre-classified; the heatmap and the time-of-day view classify here.
 */

export type Pm25Level =
  | "good"
  | "moderate"
  | "sensitive"
  | "unhealthy"
  | "very_unhealthy"
  | "hazardous";

interface Pm25Band {
  /** Exclusive upper bound, µg/m³. */
  below: number;
  level: Pm25Level;
  color: string;
  rgb: [number, number, number];
}

const BANDS: Pm25Band[] = [
  { below: 35, level: "good", color: "#22c55e", rgb: [34, 197, 94] },
  { below: 55, level: "moderate", color: "#eab308", rgb: [234, 179, 8] },
  { below: 125, level: "sensitive", color: "#f97316", rgb: [249, 115, 22] },
  { below: 225, level: "unhealthy", color: "#dc2626", rgb: [220, 38, 38] },
  { below: 325, level: "very_unhealthy", color: "#9f1239", rgb: [159, 18, 57] },
  { below: Infinity, level: "hazardous", color: "#7c2d12", rgb: [124, 45, 18] },
];

export function classifyPm25(pm25: number): Pm25Band {
  return BANDS.find((band) => pm25 < band.below) ?? BANDS[BANDS.length - 1];
}
