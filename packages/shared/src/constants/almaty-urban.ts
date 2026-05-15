import boundaryJson from "./almaty-boundary.json";
import urbanPlansJson from "./almaty-urban-plans.json";
import urbanPlanGeometryJson from "./almaty-urban-plan-geometry.json";

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

/**
 * GeoJSON LineString features for the streets in ALMATY_URBAN_PLANS,
 * each tagged with the year it's scheduled for completion (2025 / 2030 /
 * 2035 / 2040). Geometries pulled from OpenStreetMap admin_level=4
 * Almaty (one Overpass query for all highway≠service ways with names),
 * matched against the textual plan list by normalised name + manual
 * aliases for Kazakh transliteration (Райымбек→даңғылы, etc.), then
 * simplified with Douglas-Peucker at ε≈11m to halve the bundle size
 * without visible loss at our zoom range.
 *
 * Coverage: 30 of 34 listed streets matched. The 4 unmatched are
 * either purpose-built new corridors that don't yet exist in OSM
 * ("Новый проспект", "Северо-южная магистраль") or fragmented streets
 * whose OSM entry name diverges too far for the alias map to catch
 * — those degrade gracefully to text-only entries on the /urban-plans
 * page.
 *
 * Note: each feature shows the WHOLE named street, not just the segment
 * scheduled for widening. The plan describes work in chunks ("from X to
 * Y") and trimming each line to that segment would need geocoding of
 * the segment endpoints — a follow-up. For now the layer answers "which
 * streets will see major works by year Z", which is the main UX value.
 */
export interface UrbanPlanGeometryFeature {
  type: "Feature";
  properties: { name: string; year: number };
  geometry: { type: "LineString"; coordinates: number[][] };
}
export interface UrbanPlanGeometryFC {
  type: "FeatureCollection";
  features: UrbanPlanGeometryFeature[];
}
export const ALMATY_URBAN_PLAN_GEOMETRY: UrbanPlanGeometryFC =
  urbanPlanGeometryJson as UrbanPlanGeometryFC;
