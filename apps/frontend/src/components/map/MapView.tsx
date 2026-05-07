"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapData } from "@/hooks/useComplexes";
import { formatPrice } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

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

function getSeismicLabel(risk: string | null): string {
  const labels: Record<string, string> = {
    critical: "На разломе", high: "Опасная зона", moderate: "Зона внимания",
    low: "Умеренный риск", safe: "Безопасно",
  };
  return labels[risk || ""] || "";
}

function getFaultColor(danger: number): string {
  if (danger >= 3) return "#dc2626";
  if (danger >= 2) return "#f97316";
  return "#9ca3af";
}

// MapTiler free key for 3D building tiles
const MAPTILER_KEY = "get_your_own_OpIi9ZULNHzrESv6T2vL";
const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function MapView({ data, onComplexClick, hoveredComplexId, selectedComplexId }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [showFaults, setShowFaults] = useState(true);
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [colorMode, setColorMode] = useState<"score" | "seismic">("score");
  const [show3D, setShow3D] = useState(false);
  const [showAirQuality, setShowAirQuality] = useState(false);
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

            const dangerLabel = props.danger >= 3
              ? '<span style="color:#dc2626;font-weight:bold">Подтверждённый</span>'
              : props.danger >= 2
              ? '<span style="color:#f97316;font-weight:bold">Малоизученный</span>'
              : '<span style="color:#9ca3af;font-weight:bold">Спорный</span>';

            const nearby = data.complexes
              .filter((c) => {
                const dist = Math.sqrt(Math.pow((c.lng - e.lngLat.lng) * 80, 2) + Math.pow((c.lat - e.lngLat.lat) * 111, 2));
                return dist < 1.5;
              })
              .sort((a, b) => (a.seismicDistanceMeters || 9999) - (b.seismicDistanceMeters || 9999))
              .slice(0, 5);

            const nearbyHtml = nearby.length > 0
              ? `<div style="margin-top:8px;border-top:1px solid #eee;padding-top:6px">
                  <p style="font-size:11px;color:#666;margin-bottom:4px">Ближайшие ЖК:</p>
                  ${nearby.map((c) => {
                    const dist = c.seismicDistanceMeters ? (c.seismicDistanceMeters < 1000 ? `${c.seismicDistanceMeters} м` : `${(c.seismicDistanceMeters / 1000).toFixed(1)} км`) : "—";
                    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:12px">
                      <span style="width:8px;height:8px;border-radius:50%;background:${getSeismicColor(c.seismicRiskLevel)};flex-shrink:0"></span>
                      <span style="flex:1">${c.displayName}</span>
                      <span style="color:#888">${dist}</span>
                    </div>`;
                  }).join("")}</div>`
              : "";

            faultPopup.setLngLat(e.lngLat).setHTML(`
              <div style="font-family:system-ui;padding:4px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">${props.name}</div>
                <div style="font-size:12px">${dangerLabel}</div>
                ${nearbyHtml}
              </div>
            `).addTo(map);
          });
        }
      }

      // === AIR QUALITY (PM 2.5) HEATMAP + STATION MARKERS ===
      if (data.airStations && data.airStations.length > 0) {
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

        // Heatmap — green→yellow→orange→red gradient by PM 2.5
        // With ~380 stations across the city we want generous radius
        // for smooth interpolation between neighboring sensors.
        map.addLayer({
          id: "air-heatmap",
          type: "heatmap",
          source: "air-stations",
          layout: { visibility: "none" },
          paint: {
            // Weight: low PM 2.5 contributes weakly, high PM 2.5 dominates
            "heatmap-weight": [
              "interpolate", ["linear"], ["get", "pm25"],
              0, 0.2,
              12, 0.4,
              35, 0.7,
              55, 0.9,
              100, 1,
              200, 1,
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              9, 0.6,
              11, 1,
              13, 1.4,
              16, 2,
            ],
            // Density-based color ramp (transparent at edges, saturated at peaks)
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(34,197,94,0)",
              0.1, "rgba(34,197,94,0.35)",
              0.3, "rgba(132,204,22,0.5)",
              0.5, "rgba(234,179,8,0.65)",
              0.7, "rgba(249,115,22,0.75)",
              0.85, "rgba(220,38,38,0.85)",
              1, "rgba(127,29,29,0.95)",
            ],
            // Big radius so neighboring stations blend into smooth field
            "heatmap-radius": [
              "interpolate", ["linear"], ["zoom"],
              9, 50,
              11, 90,
              13, 140,
              15, 200,
              17, 280,
            ],
            "heatmap-opacity": [
              "interpolate", ["linear"], ["zoom"],
              9, 0.75,
              14, 0.65,
              17, 0.4,
            ],
          },
        });

        // Station marker dots — only at higher zoom (otherwise too cluttered)
        map.addLayer({
          id: "air-stations-circles",
          type: "circle",
          source: "air-stations",
          layout: { visibility: "none" },
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
          const date = p.updatedAt ? new Date(p.updatedAt).toLocaleString("ru-RU", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          }) : "";
          stationPopup.setLngLat(coords).setHTML(`
            <div style="font-family:system-ui;padding:4px;font-size:12px">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span style="width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
                <strong>${p.name}</strong>
              </div>
              <div style="font-size:18px;font-weight:700;color:${p.color}">${p.pm25} <span style="font-size:11px;font-weight:400;color:#666">µg/m³</span></div>
              <div style="color:${p.color};font-size:11px;font-weight:500">${p.levelLabel}</div>
              ${p.origin ? `<div style="color:#888;font-size:10px;margin-top:4px">Источник: ${p.origin}${p.district ? " · " + p.district : ""}</div>` : ""}
              ${date ? `<div style="color:#aaa;font-size:10px">${date}</div>` : ""}
            </div>
          `).addTo(map);
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
          "circle-color": ["get", "scoreColor"],
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

        popup.setLngLat(coords).setHTML(`
          <div style="font-family:system-ui;padding:4px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <strong style="font-size:14px">${props.name}</strong>
              ${props.score ? `<span style="background:${props.scoreColor};color:white;padding:2px 8px;border-radius:12px;font-weight:bold;font-size:12px">${Math.round(props.score)}%</span>` : ""}
            </div>
            ${props.priceMin && props.priceMax ? `<div style="font-weight:600;margin-top:4px">${formatPrice(props.priceMin)} — ${formatPrice(props.priceMax)}</div>` : ""}
            <div style="display:flex;gap:12px;margin-top:4px;color:#666;font-size:12px">
              <span>🏠 ${props.listings} объявл.</span>
              ${props.commute ? `<span>🚗 ${props.commute} мин</span>` : ""}
            </div>
            ${seismicDist ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border-radius:6px;font-size:11px;background:${seismicBg}">
              <span style="width:8px;height:8px;border-radius:50%;background:${getSeismicColor(seismicRisk)};flex-shrink:0"></span>
              <span>${getSeismicLabel(seismicRisk)}</span>
              <span style="color:#888;margin-left:auto">${seismicDistStr} до разлома</span>
            </div>` : ""}
          </div>
        `).addTo(map);
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
  }, [data, isDark]);

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

  // Toggle layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const danger of [1, 2, 3]) {
      const layerId = `faults-lines-${danger}`;
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", showFaults ? "visible" : "none");
    }
  }, [showFaults]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const id of ["risk-zone-low", "risk-zone-moderate", "risk-zone-high"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showRiskZones && showFaults ? "visible" : "none");
    }
  }, [showRiskZones, showFaults]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("complexes-circles")) return;
    map.setPaintProperty("complexes-circles", "circle-color", ["get", colorMode === "score" ? "scoreColor" : "seismicColor"]);
  }, [colorMode]);

  // Toggle air quality layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const id of ["air-heatmap", "air-stations-circles"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showAirQuality ? "visible" : "none");
      }
    }
  }, [showAirQuality]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Controls - repositioned for mobile (no sidebar overlap) */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2 max-w-[160px] sm:max-w-[180px] z-10">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Слои</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={showFaults} onChange={(e) => setShowFaults(e.target.checked)} className="rounded accent-red-500 w-3.5 h-3.5" />
          Разломы
        </label>
        {showFaults && (
          <label className="flex items-center gap-2 text-xs cursor-pointer ml-4">
            <input type="checkbox" checked={showRiskZones} onChange={(e) => setShowRiskZones(e.target.checked)} className="rounded accent-orange-500 w-3.5 h-3.5" />
            Зоны риска
          </label>
        )}
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showAirQuality}
            onChange={(e) => setShowAirQuality(e.target.checked)}
            className="rounded accent-emerald-500 w-3.5 h-3.5"
          />
          🌫 Воздух (PM 2.5)
        </label>

        <div className="border-t pt-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Цвет</p>
          <div className="flex gap-1">
            <button
              onClick={() => setColorMode("score")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition ${colorMode === "score" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              Рейтинг
            </button>
            <button
              onClick={() => setColorMode("seismic")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition ${colorMode === "seismic" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              Сейсмика
            </button>
          </div>
        </div>
      </div>

      {/* Compact legend */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-card/95 text-card-foreground border border-border backdrop-blur rounded-lg shadow-lg p-2 sm:p-2.5 text-[9px] sm:text-[10px] space-y-0.5 sm:space-y-1 z-10">
        {colorMode === "seismic" ? (
          <>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Безопасно ({riskCounts.safe})</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />Умеренный ({riskCounts.moderate})</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />Высокий ({riskCounts.high})</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" />Опасная ({riskCounts.critical})</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />85%+</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />70-84%</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />&lt;70%</div>
          </>
        )}
        {showFaults && (
          <div className="border-t pt-1 mt-1 space-y-0.5">
            <div className="flex items-center gap-1.5"><span className="w-3 h-px bg-red-600" />Разлом</div>
            {showRiskZones && <div className="flex items-center gap-1.5"><span className="w-3 h-2 bg-red-200/60 rounded-sm" />Зоны</div>}
          </div>
        )}
        {showAirQuality && (
          <div className="border-t pt-1 mt-1 space-y-0.5">
            <div className="font-medium text-[10px]">
              PM 2.5 (µg/m³)
              {data.airStations && (
                <span className="text-muted-foreground font-normal ml-1">
                  · {data.airStations.length} станций
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />0–12 хорошее</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />12–35 умеренное</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />35–55 чувств.</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" />55+ вредное</div>
          </div>
        )}
      </div>
    </div>
  );
}
