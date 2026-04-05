"use client";

import { useEffect, useRef, useState } from "react";
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

function getFaultColor(danger: number): string {
  if (danger >= 3) return "#dc2626";
  if (danger >= 2) return "#f97316";
  return "#9ca3af";
}

export default function MapView({ data, onComplexClick }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [showFaults, setShowFaults] = useState(true);

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
      // Add ЖК markers as GeoJSON source
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
          district: c.district,
          color: getScoreColor(c.scoreTotal),
        },
      }));

      map.addSource("complexes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: complexFeatures,
        },
      });

      map.addLayer({
        id: "complexes-circles",
        type: "circle",
        source: "complexes",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"],
            ["get", "listings"],
            1, 8,
            5, 12,
            10, 16,
            20, 20,
          ],
          "circle-color": ["get", "color"],
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

      // Add fault lines
      if (data.faultLines && data.faultLines.length > 0) {
        // Group faults by danger level for different styling
        for (const danger of [3, 2, 1]) {
          const faults = data.faultLines.filter((f) => f.danger === danger);
          if (faults.length === 0) continue;

          const features = faults.map((f) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: f.coordinates.map(([lat, lng]) => [lng, lat]),
            },
            properties: {
              name: f.name,
              label: f.label,
              danger: f.danger,
            },
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
              "line-opacity": 0.6,
              "line-dasharray": danger < 3 ? [2, 2] : [1],
            },
          });
        }
      }

      // Popup on hover
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "260px",
      });

      map.on("mouseenter", "complexes-circles", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;
        const coords = (feature.geometry as any).coordinates.slice();

        const scoreHtml = props.score
          ? `<span style="background:${props.color};color:white;padding:2px 8px;border-radius:12px;font-weight:bold;font-size:12px">${Math.round(props.score)}%</span>`
          : "";

        const priceHtml = props.priceMin && props.priceMax
          ? `<div style="font-weight:600;margin-top:4px">${formatPrice(props.priceMin)} — ${formatPrice(props.priceMax)}</div>`
          : "";

        const commuteHtml = props.commute
          ? `<span style="color:#666;font-size:12px">🚗 ${props.commute} мин</span>`
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
          </div>
        `).addTo(map);
      });

      map.on("mouseleave", "complexes-circles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      // Click to navigate
      map.on("click", "complexes-circles", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && onComplexClick) onComplexClick(id);
      });

      // Fit bounds to show all complexes
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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Map controls */}
      <div className="absolute top-3 left-3 bg-white rounded-lg shadow-md p-2 space-y-1">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={showFaults}
            onChange={(e) => setShowFaults(e.target.checked)}
            className="rounded"
          />
          Разломы
        </label>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white rounded-lg shadow-md p-3 text-xs space-y-1.5">
        <p className="font-medium">Легенда</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span>85%+ рейтинг</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>70-84%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500" />
          <span>&lt;70%</span>
        </div>
        {showFaults && (
          <>
            <div className="border-t pt-1 mt-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-red-600" />
                <span>Подтверждённый разлом</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-orange-500" style={{ borderTop: "2px dashed" }} />
                <span>Малоизученный</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
