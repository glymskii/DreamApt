"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapData } from "@/hooks/useComplexes";
import { formatPrice } from "@/lib/utils";

interface MapViewProps {
  data: MapData;
  onComplexClick?: (complexId: string) => void;
}

function getScoreColor(score: number | null): string {
  if (!score) return "#999";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  return "#f97316";
}

function getSeismicColor(risk: string | null): string {
  if (!risk) return "#999";
  if (risk === "critical") return "#dc2626";
  if (risk === "high") return "#f97316";
  if (risk === "moderate") return "#eab308";
  if (risk === "low") return "#84cc16";
  return "#22c55e";
}

function getSeismicLabel(risk: string | null): string {
  if (!risk) return "Нет данных";
  const labels: Record<string, string> = {
    critical: "На разломе",
    high: "Опасная зона",
    moderate: "Зона внимания",
    low: "Умеренный риск",
    safe: "Безопасно",
  };
  return labels[risk] || risk;
}

function getFaultColor(danger: number): string {
  if (danger >= 3) return "#dc2626";
  if (danger >= 2) return "#f97316";
  return "#9ca3af";
}

export default function MapView({ data, onComplexClick }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [showFaults, setShowFaults] = useState(true);
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [colorMode, setColorMode] = useState<"score" | "seismic">("score");

  // Count complexes by seismic risk
  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0, safe: 0 };
    data.complexes.forEach((c) => {
      const risk = c.seismicRiskLevel || "safe";
      counts[risk] = (counts[risk] || 0) + 1;
    });
    return counts;
  }, [data.complexes]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [76.9286, 43.238],
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // === FAULT RISK ZONES (wide buffer lines behind fault lines) ===
      if (data.faultLines && data.faultLines.length > 0) {
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

        // Risk zone layers (wide lines as buffer visualization)
        // 1500m zone (yellow) — widest, rendered first (behind)
        map.addLayer({
          id: "risk-zone-low",
          type: "line",
          source: "faults-all",
          paint: {
            "line-color": "#fef08a",
            "line-width": [
              "interpolate", ["exponential", 2], ["zoom"],
              10, 4, 12, 16, 14, 60, 16, 200,
            ],
            "line-opacity": 0.15,
          },
        });

        // 700m zone (orange)
        map.addLayer({
          id: "risk-zone-moderate",
          type: "line",
          source: "faults-all",
          paint: {
            "line-color": "#fed7aa",
            "line-width": [
              "interpolate", ["exponential", 2], ["zoom"],
              10, 2, 12, 8, 14, 28, 16, 90,
            ],
            "line-opacity": 0.2,
          },
        });

        // 300m zone (red)
        map.addLayer({
          id: "risk-zone-high",
          type: "line",
          source: "faults-all",
          paint: {
            "line-color": "#fecaca",
            "line-width": [
              "interpolate", ["exponential", 2], ["zoom"],
              10, 1, 12, 4, 14, 12, 16, 40,
            ],
            "line-opacity": 0.3,
          },
        });

        // Actual fault lines on top
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

        // === FAULT CLICK POPUP ===
        const faultPopup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "300px",
        });

        for (const danger of [3, 2, 1]) {
          const layerId = `faults-lines-${danger}`;

          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "crosshair";
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
          });

          map.on("click", layerId, (e) => {
            e.originalEvent.stopPropagation();
            const feature = e.features?.[0];
            if (!feature) return;

            const props = feature.properties;
            const dangerLabel = props.danger >= 3
              ? '<span style="color:#dc2626;font-weight:bold">Подтверждённый</span>'
              : props.danger >= 2
              ? '<span style="color:#f97316;font-weight:bold">Малоизученный</span>'
              : '<span style="color:#9ca3af;font-weight:bold">Спорный</span>';

            // Find nearby complexes (within ~1km visually)
            const clickLng = e.lngLat.lng;
            const clickLat = e.lngLat.lat;
            const nearbyComplexes = data.complexes
              .filter((c) => {
                const dist = Math.sqrt(
                  Math.pow((c.lng - clickLng) * 80, 2) +
                  Math.pow((c.lat - clickLat) * 111, 2),
                );
                return dist < 1.5; // ~1.5 km
              })
              .sort((a, b) => (a.seismicDistanceMeters || 9999) - (b.seismicDistanceMeters || 9999))
              .slice(0, 5);

            const nearbyHtml = nearbyComplexes.length > 0
              ? `<div style="margin-top:8px;border-top:1px solid #eee;padding-top:6px">
                  <p style="font-size:11px;color:#666;margin-bottom:4px">Ближайшие ЖК:</p>
                  ${nearbyComplexes.map((c) => {
                    const riskColor = getSeismicColor(c.seismicRiskLevel);
                    const dist = c.seismicDistanceMeters
                      ? c.seismicDistanceMeters < 1000
                        ? `${c.seismicDistanceMeters} м`
                        : `${(c.seismicDistanceMeters / 1000).toFixed(1)} км`
                      : "—";
                    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;font-size:12px">
                      <span style="width:8px;height:8px;border-radius:50%;background:${riskColor};flex-shrink:0"></span>
                      <span style="flex:1">${c.displayName}</span>
                      <span style="color:#888">${dist}</span>
                    </div>`;
                  }).join("")}
                </div>`
              : "";

            faultPopup
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family:system-ui;padding:4px">
                  <div style="font-size:14px;font-weight:600;margin-bottom:4px">${props.name}</div>
                  <div style="font-size:12px">${dangerLabel}</div>
                  <div style="font-size:11px;color:#888;margin-top:2px">${props.label}</div>
                  ${nearbyHtml}
                </div>
              `)
              .addTo(map);
          });
        }
      }

      // === COMPLEX MARKERS ===
      const complexFeatures = data.complexes.map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [c.lng, c.lat],
        },
        properties: {
          id: c.id,
          name: c.displayName,
          score: c.scoreTotal,
          price: c.priceAvg,
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
          "circle-radius": [
            "interpolate", ["linear"],
            ["get", "listings"],
            1, 8, 5, 12, 10, 16, 20, 20,
          ],
          "circle-color": ["get", "scoreColor"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      // Labels
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

      // === COMPLEX HOVER POPUP (with seismic info) ===
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "280px",
      });

      map.on("mouseenter", "complexes-circles", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;
        const coords = (feature.geometry as any).coordinates.slice();

        const scoreHtml = props.score
          ? `<span style="background:${props.scoreColor};color:white;padding:2px 8px;border-radius:12px;font-weight:bold;font-size:12px">${Math.round(props.score)}%</span>`
          : "";

        const priceHtml = props.priceMin && props.priceMax
          ? `<div style="font-weight:600;margin-top:4px">${formatPrice(props.priceMin)} — ${formatPrice(props.priceMax)}</div>`
          : "";

        const commuteHtml = props.commute
          ? `<span style="color:#666;font-size:12px">🚗 ${props.commute} мин</span>`
          : "";

        // Seismic info in popup
        const seismicRisk = props.seismic || "safe";
        const seismicDist = props.seismicDist;
        const seismicDistStr = seismicDist
          ? seismicDist < 1000
            ? `${seismicDist} м`
            : `${(seismicDist / 1000).toFixed(1)} км`
          : "";
        const seismicBgColor =
          seismicRisk === "critical" || seismicRisk === "high"
            ? "#fef2f2"
            : seismicRisk === "moderate"
            ? "#fffbeb"
            : "";
        const seismicHtml = seismicDist
          ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border-radius:6px;font-size:11px;background:${seismicBgColor || "#f0fdf4"}">
              <span style="width:8px;height:8px;border-radius:50%;background:${getSeismicColor(seismicRisk)};flex-shrink:0"></span>
              <span>${getSeismicLabel(seismicRisk)}</span>
              <span style="color:#888;margin-left:auto">${seismicDistStr} до разлома</span>
            </div>`
          : "";

        popup.setLngLat(coords).setHTML(`
          <div style="font-family:system-ui;padding:4px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <strong style="font-size:14px">${props.name}</strong>
              ${scoreHtml}
            </div>
            ${priceHtml}
            <div style="display:flex;gap:12px;margin-top:4px;color:#666;font-size:12px">
              <span>🏠 ${props.listings} объявл.</span>
              ${commuteHtml}
            </div>
            ${props.district ? `<div style="color:#999;font-size:11px;margin-top:2px">${props.district}</div>` : ""}
            ${seismicHtml}
          </div>
        `).addTo(map);
      });

      map.on("mouseleave", "complexes-circles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      // Click to navigate
      map.on("click", "complexes-circles", (e) => {
        e.originalEvent.stopPropagation();
        const id = e.features?.[0]?.properties?.id;
        if (id && onComplexClick) onComplexClick(id);
      });

      // Fit bounds
      if (complexFeatures.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        complexFeatures.forEach((f) => {
          bounds.extend(f.geometry.coordinates as [number, number]);
        });
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [data, onComplexClick]);

  // Toggle fault layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const danger of [1, 2, 3]) {
      const layerId = `faults-lines-${danger}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", showFaults ? "visible" : "none");
      }
    }
  }, [showFaults]);

  // Toggle risk zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const id of ["risk-zone-low", "risk-zone-moderate", "risk-zone-high"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showRiskZones && showFaults ? "visible" : "none");
      }
    }
  }, [showRiskZones, showFaults]);

  // Toggle color mode (score vs seismic)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer("complexes-circles")) return;

    const colorProp = colorMode === "score" ? "scoreColor" : "seismicColor";
    map.setPaintProperty("complexes-circles", "circle-color", ["get", colorProp]);
  }, [colorMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Map controls */}
      <div className="absolute top-3 left-3 bg-white rounded-lg shadow-md p-3 space-y-2 max-w-[200px]">
        <p className="text-xs font-medium text-muted-foreground">Слои</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showFaults}
            onChange={(e) => setShowFaults(e.target.checked)}
            className="rounded accent-red-500"
          />
          Разломы
        </label>
        {showFaults && (
          <label className="flex items-center gap-2 text-xs cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={showRiskZones}
              onChange={(e) => setShowRiskZones(e.target.checked)}
              className="rounded accent-orange-500"
            />
            Зоны риска
          </label>
        )}

        <div className="border-t pt-2 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Цвет маркеров</p>
          <div className="flex gap-1">
            <button
              onClick={() => setColorMode("score")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                colorMode === "score"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Рейтинг
            </button>
            <button
              onClick={() => setColorMode("seismic")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                colorMode === "seismic"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Сейсмика
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white rounded-lg shadow-md p-3 text-xs space-y-1.5 max-w-[200px]">
        <p className="font-medium">Легенда</p>

        {colorMode === "score" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <span>85%+ рейтинг</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />
              <span>70-84%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
              <span>&lt;70%</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <span>Безопасно ({riskCounts.safe})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-lime-500 shrink-0" />
              <span>Низкий риск ({riskCounts.low})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />
              <span>Умеренный ({riskCounts.moderate})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
              <span>Высокий ({riskCounts.high})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
              <span>Опасная зона ({riskCounts.critical})</span>
            </div>
          </>
        )}

        {showFaults && (
          <div className="border-t pt-1.5 mt-1.5 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-red-600 shrink-0" />
              <span>Подтверждённый разлом</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 border-t-2 border-dashed border-gray-400 shrink-0" />
              <span>Спорный / малоизуч.</span>
            </div>
            {showRiskZones && (
              <div className="flex items-center gap-2 mt-1">
                <span className="w-4 h-3 bg-red-200/50 rounded-sm shrink-0" />
                <span>Зоны риска</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
