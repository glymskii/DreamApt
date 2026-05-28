"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiUnauthorizedError } from "@/lib/api-client";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, RotateCcw, Loader2 } from "lucide-react";

/**
 * Interactive admin tool for calibrating the genplan-2040 raster overlay.
 *
 * The four corners (NW/NE/SE/SW) of the image are draggable markers on
 * a MapLibre map. Dragging a corner updates the image source's
 * coordinates in real time so the admin sees the warp as it happens.
 * Side panel shows the current numeric lat/lng of each corner (live
 * via map.dragstart/drag/dragend) plus an opacity slider.
 *
 * "Save" writes back via PUT /api/admin/map-overlays/genplan-2040 and
 * invalidates the local map-data cache so the public dashboard picks
 * up the new bbox on next refresh.
 *
 * Why drag-corners and not tie-points (image-pixel → map-coord pairs):
 * MapLibre's image source already takes 4 corners directly — no warp
 * solver needed on our side. The admin can also just edit numbers in
 * the side panel for fine sub-meter tuning.
 */

interface OverlayConfig {
  key: string;
  imageUrl: string;
  nwLon: number;
  nwLat: number;
  neLon: number;
  neLat: number;
  seLon: number;
  seLat: number;
  swLon: number;
  swLat: number;
  opacity: number;
}

/** Overlay keys this page can calibrate + their display titles + the
 *  fallback image used only if the API GET fails. The active overlay is
 *  chosen via ?key=<key> (defaults to genplan-2040). */
const OVERLAY_META: Record<string, { title: string; imageUrl: string }> = {
  "genplan-2040": { title: "Генплан 2040", imageUrl: "/genplan-2040.jpg" },
  "pdp-aksay-zhetysu": { title: "ПДП Аксай / Жетысу (401 га)", imageUrl: "/pdp-aksay-zhetysu.jpg" },
  "pdp-ryskulbekov-navoi": { title: "ПДП Рыскулбекова / Навои (515 га)", imageUrl: "/pdp-ryskulbekov-navoi.jpg" },
  "pdp-sairan": { title: "ПДП Сайран (977 га)", imageUrl: "/pdp-sairan.jpg" },
};
const DEFAULT_KEY = "genplan-2040";

export default function GenplanAlignPage() {
  // useSearchParams must sit under a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <GenplanAlignInner />
    </Suspense>
  );
}

function GenplanAlignInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const KEY = searchParams.get("key") || DEFAULT_KEY;
  const meta = OVERLAY_META[KEY] || OVERLAY_META[DEFAULT_KEY];
  const { user, isLoading: authLoading } = useAuth();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const cfgRef = useRef<OverlayConfig | null>(null);

  const [cfg, setCfg] = useState<OverlayConfig | null>(null);
  const [opacity, setOpacity] = useState(0.65);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Admin gate
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  // Load current config
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api.get<OverlayConfig>(`/map-overlays/${KEY}`)
      .then((c) => {
        setCfg(c);
        cfgRef.current = c;
        setOpacity(c.opacity);
      })
      .catch(() => {
        // Fall back to a generic seed centred on Almaty — only hit if the
        // API GET fails; admin drags corners into place from here.
        const seed: OverlayConfig = {
          key: KEY,
          imageUrl: meta.imageUrl,
          nwLon: 76.84, nwLat: 43.27,
          neLon: 76.92, neLat: 43.27,
          seLon: 76.92, seLat: 43.19,
          swLon: 76.84, swLat: 43.19,
          opacity: 0.7,
        };
        setCfg(seed);
        cfgRef.current = seed;
      });
  }, [user, KEY]);

  // Initialise map + image source + corner markers once we have config
  useEffect(() => {
    if (!cfg || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [76.93, 43.22],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("genplan-img", {
        type: "image",
        url: cfg.imageUrl,
        coordinates: cornersToArray(cfg),
      });
      map.addLayer({
        id: "genplan-img",
        type: "raster",
        source: "genplan-img",
        paint: {
          "raster-opacity": cfg.opacity,
          "raster-fade-duration": 0,
        },
      });

      // Four colour-coded draggable markers, one per corner.
      const corners: { label: "NW" | "NE" | "SE" | "SW"; color: string }[] = [
        { label: "NW", color: "#dc2626" },
        { label: "NE", color: "#f97316" },
        { label: "SE", color: "#16a34a" },
        { label: "SW", color: "#2563eb" },
      ];
      for (const c of corners) {
        const el = document.createElement("div");
        el.textContent = c.label;
        el.style.cssText = `
          background:${c.color};color:white;font-weight:700;font-size:11px;
          width:32px;height:32px;border-radius:50%;display:flex;
          align-items:center;justify-content:center;cursor:grab;
          border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);
        `;
        const m = new maplibregl.Marker({ element: el, draggable: true });
        const [lon, lat] = cornerToLngLat(cfg, c.label);
        m.setLngLat([lon, lat]);
        m.addTo(map);
        m.on("drag", () => {
          const ll = m.getLngLat();
          const cur = cfgRef.current;
          if (!cur) return;
          const next = { ...cur };
          if (c.label === "NW") { next.nwLon = ll.lng; next.nwLat = ll.lat; }
          if (c.label === "NE") { next.neLon = ll.lng; next.neLat = ll.lat; }
          if (c.label === "SE") { next.seLon = ll.lng; next.seLat = ll.lat; }
          if (c.label === "SW") { next.swLon = ll.lng; next.swLat = ll.lat; }
          cfgRef.current = next;
          // Live-update the image source — no React state for hot path
          // to keep the drag smooth. State commits on dragend.
          const src = map.getSource("genplan-img") as maplibregl.ImageSource | undefined;
          if (src) src.setCoordinates(cornersToArray(next));
        });
        m.on("dragend", () => {
          setCfg({ ...(cfgRef.current as OverlayConfig) });
        });
        markersRef.current.push(m);
      }

      // Helpful: zoom-to-fit the whole overlay
      const bounds = new maplibregl.LngLatBounds()
        .extend([cfg.nwLon, cfg.nwLat])
        .extend([cfg.seLon, cfg.seLat]);
      map.fitBounds(bounds, { padding: 60, duration: 0 });
    });

    return () => { map.remove(); mapRef.current = null; markersRef.current = []; };
  }, [cfg?.imageUrl]); // re-init only if image swaps

  // Live opacity tweak — no save needed, just update the layer
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("genplan-img")) return;
    m.setPaintProperty("genplan-img", "raster-opacity", opacity);
  }, [opacity]);

  // Update markers when numeric inputs change
  const updateCorner = (corner: "NW" | "NE" | "SE" | "SW", which: "lon" | "lat", v: number) => {
    if (!cfgRef.current) return;
    const next = { ...cfgRef.current };
    const k = (corner.toLowerCase() + (which === "lon" ? "Lon" : "Lat")) as keyof OverlayConfig;
    (next[k] as any) = v;
    cfgRef.current = next;
    setCfg(next);
    // Update marker + image
    const idx = { NW: 0, NE: 1, SE: 2, SW: 3 }[corner];
    const [lon, lat] = cornerToLngLat(next, corner);
    markersRef.current[idx]?.setLngLat([lon, lat]);
    const src = mapRef.current?.getSource("genplan-img") as maplibregl.ImageSource | undefined;
    if (src) src.setCoordinates(cornersToArray(next));
  };

  const save = async () => {
    if (!cfgRef.current) return;
    setSaving(true);
    try {
      // Coerce to plain numbers — defends against any rogue string that
      // might have slipped in from the number-input onChange handler.
      const body = {
        imageUrl: cfgRef.current.imageUrl,
        nwLon: Number(cfgRef.current.nwLon),
        nwLat: Number(cfgRef.current.nwLat),
        neLon: Number(cfgRef.current.neLon),
        neLat: Number(cfgRef.current.neLat),
        seLon: Number(cfgRef.current.seLon),
        seLat: Number(cfgRef.current.seLat),
        swLon: Number(cfgRef.current.swLon),
        swLat: Number(cfgRef.current.swLat),
        opacity: Number(opacity),
      };
      console.log("[align] PUT body:", body);
      await api.put(`/admin/map-overlays/${KEY}`, body);
      setSavedAt(Date.now());
    } catch (e) {
      // Distinguish auth-fail (most common cause after a day idle) from
      // network/validation errors so the user knows what to do.
      console.error("[align] save failed:", e);
      if (e instanceof ApiUnauthorizedError) {
        alert(
          "Сессия истекла. Перелогинься через хедер и попробуй снова — " +
          "значения углов уже в полях, они не потеряются.",
        );
        return;
      }
      alert("Не удалось сохранить: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!cfg) return;
    cfgRef.current = cfg;
    setOpacity(cfg.opacity);
    // Reset markers + image
    const corners: ("NW" | "NE" | "SE" | "SW")[] = ["NW", "NE", "SE", "SW"];
    corners.forEach((label, idx) => {
      const [lon, lat] = cornerToLngLat(cfg, label);
      markersRef.current[idx]?.setLngLat([lon, lat]);
    });
    const src = mapRef.current?.getSource("genplan-img") as maplibregl.ImageSource | undefined;
    if (src) src.setCoordinates(cornersToArray(cfg));
  };

  if (authLoading || !user || user.role !== "admin") return null;
  if (!cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col">
      <Header />
      <div className="border-b px-4 py-2 flex items-center gap-3 shrink-0">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="h-8">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад
          </Button>
        </Link>
        <h1 className="font-bold">Калибровка слоя</h1>
        <select
          value={KEY}
          onChange={(e) => router.replace(`/admin/genplan-align?key=${e.target.value}`)}
          className="flex-1 max-w-[280px] text-sm border rounded px-2 py-1 bg-background"
        >
          {Object.entries(OVERLAY_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.title}
            </option>
          ))}
        </select>
        {savedAt && Date.now() - savedAt < 5000 && (
          <span className="text-xs text-green-600 dark:text-green-400">Сохранено ✓</span>
        )}
        <Button size="sm" variant="outline" onClick={reset} disabled={saving}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Сбросить
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Сохранить
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div ref={containerRef} className="flex-1" />

        {/* Side panel — numeric corner inputs + opacity */}
        <aside className="w-[320px] border-l p-4 overflow-y-auto space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Перетащи углы на карте</p>
            <p className="text-xs text-muted-foreground">
              Каждый цветной маркер — угол изображения генплана. Двигай
              на пересечения улиц чтобы совместить с реальной картой.
              Поля ниже — для точной правки.
            </p>
          </div>

          <CornerInputs
            label="NW (красный)"
            color="#dc2626"
            lon={cfg.nwLon}
            lat={cfg.nwLat}
            onLon={(v) => updateCorner("NW", "lon", v)}
            onLat={(v) => updateCorner("NW", "lat", v)}
          />
          <CornerInputs
            label="NE (оранжевый)"
            color="#f97316"
            lon={cfg.neLon}
            lat={cfg.neLat}
            onLon={(v) => updateCorner("NE", "lon", v)}
            onLat={(v) => updateCorner("NE", "lat", v)}
          />
          <CornerInputs
            label="SE (зелёный)"
            color="#16a34a"
            lon={cfg.seLon}
            lat={cfg.seLat}
            onLon={(v) => updateCorner("SE", "lon", v)}
            onLat={(v) => updateCorner("SE", "lat", v)}
          />
          <CornerInputs
            label="SW (синий)"
            color="#2563eb"
            lon={cfg.swLon}
            lat={cfg.swLat}
            onLon={(v) => updateCorner("SW", "lon", v)}
            onLat={(v) => updateCorner("SW", "lat", v)}
          />

          <div className="border-t pt-3">
            <label className="text-xs font-medium block mb-1">
              Прозрачность: {(opacity * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="text-[11px] text-muted-foreground border-t pt-3 leading-snug">
            После «Сохранить» новые координаты применятся на главной карте
            при следующем обновлении страницы (CDN-кэш до 60 секунд).
          </div>
        </aside>
      </div>
    </div>
  );
}

function CornerInputs({
  label,
  color,
  lon,
  lat,
  onLon,
  onLat,
}: {
  label: string;
  color: string;
  lon: number;
  lat: number;
  onLon: (v: number) => void;
  onLat: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          step="0.0001"
          value={lon.toFixed(4)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onLon(v);
          }}
          className="text-xs font-mono px-2 py-1 border rounded bg-background"
        />
        <input
          type="number"
          step="0.0001"
          value={lat.toFixed(4)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onLat(v);
          }}
          className="text-xs font-mono px-2 py-1 border rounded bg-background"
        />
      </div>
      <div className="text-[10px] text-muted-foreground font-mono pl-5">
        lon · lat
      </div>
    </div>
  );
}

type CornersTuple = [[number, number], [number, number], [number, number], [number, number]];

/** Convert corner config to the 4-tuple expected by MapLibre's
 *  ImageSource.coordinates: [NW, NE, SE, SW]. */
function cornersToArray(c: OverlayConfig): CornersTuple {
  return [
    [c.nwLon, c.nwLat],
    [c.neLon, c.neLat],
    [c.seLon, c.seLat],
    [c.swLon, c.swLat],
  ];
}

function cornerToLngLat(c: OverlayConfig, which: "NW" | "NE" | "SE" | "SW"): [number, number] {
  if (which === "NW") return [c.nwLon, c.nwLat];
  if (which === "NE") return [c.neLon, c.neLat];
  if (which === "SE") return [c.seLon, c.seLat];
  return [c.swLon, c.swLat];
}
