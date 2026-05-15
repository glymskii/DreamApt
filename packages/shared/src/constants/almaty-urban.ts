import boundaryJson from "./almaty-boundary.json";
import urbanPlansJson from "./almaty-urban-plans.json";

/**
 * Almaty city administrative boundary as a GeoJSON FeatureCollection.
 * Source: OpenStreetMap relation 2465058 (admin_level=4 = city), fetched
 * via Overpass API. Simplified from 2212 to ~455 points using Ramer-
 * Douglas-Peucker with epsilon ≈ 50m, which is invisible at the zoom
 * levels we render (10–15) and shrinks the bundle from ~57KB to ~12KB.
 *
 * The polygon is one outer ring; OSM also has a small enclave ring we
 * dropped to keep the shape readable on the map (~166 points off in
 * the mountains, not relevant to the residential coverage).
 */
export interface AlmatyBoundary {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string; admin_level: number; source: string };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
}
export const ALMATY_BOUNDARY: AlmatyBoundary = boundaryJson as AlmatyBoundary;

/**
 * Almaty 2040 master-plan street widening / "пробивка" timeline.
 * Source: Tengrinews summary of the official genplan (link in the JSON's
 * `source` field). Grouped by 5-year completion waves through 2040.
 *
 * Geometries are NOT yet bundled — this MVP surfaces the plan as a
 * structured textual list (admin/info panel). Adding precise OSM-traced
 * line segments per street is a follow-up: roughly 40 streets × manual
 * Overpass lookup + segment trim. The current dataset is enough to show
 * the user "what's coming, when, where" without the visualisation.
 */
export interface UrbanPlanStreet {
  name: string;
  zone: string;
  segment: string;
}
export interface UrbanPlanPhase {
  year: number;
  label: string;
  streets: UrbanPlanStreet[];
}
export interface UrbanPlansData {
  source: {
    primary: string;
    primaryUrl: string;
    fullMapUrl: string;
    officialAuthority: string;
    authorityUrl: string;
    newsContext: string;
    lastUpdated: string;
  };
  phases: UrbanPlanPhase[];
}
export const ALMATY_URBAN_PLANS: UrbanPlansData = urbanPlansJson as UrbanPlansData;
