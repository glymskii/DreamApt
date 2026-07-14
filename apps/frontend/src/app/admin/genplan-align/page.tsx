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
import { ArrowLeft, Save, RotateCcw, Loader2, Move, Maximize2, RotateCw } from "lucide-react";

/**
 * Admin tool for calibrating a raster overlay (genplan / ПДП) onto the map.
 *
 * RIGID transform model — the image keeps its native aspect ratio and is
 * never sheared. The operator controls only three things:
 *   • перемещение  — drag the centre marker (или поля lat/lng)
 *   • размер       — drag the orange handle / ширина-слайдер (масштаб, пропорции сохраняются)
 *   • поворот      — drag the orange handle vокруг центра / слайдер
 *
 * Internally we store {centre, widthKm, rotation} + the image's natural
 * aspect, and derive the 4 MapLibre image-source corners from them. On
 * save we PUT those 4 corners (backend + dashboard render are unchanged —
 * they still consume 4 corners, which now always form a rigid rotated
 * rectangle). On load we decompose existing corners back into the
 * transform; height is re-derived from the image aspect so a previously
 * sheared overlay snaps back to correct proportions.
 */

interface OverlayConfig {
  key: string;
  imageUrl: string;
  nwLon: number; nwLat: number;
  neLon: number; neLat: number;
  seLon: number; seLat: number;
  swLon: number; swLat: number;
  opacity: number;
}

interface Transform {
  centerLng: number;
  centerLat: number;
  widthKm: number;
  rotDeg: number; // clockwise-positive
}

const OVERLAY_META: Record<string, { title: string; imageUrl: string }> = {
  "genplan-2040": { title: "Генплан 2040", imageUrl: "/genplan-2040.jpg" },
  "genplan-detailed": { title: "Детальный генплан (Тихон Шутов)", imageUrl: "/genplan-detailed.webp" },
  "pdp-aksay-zhetysu": { title: "ПДП Аксай / Жетысу (401 га)", imageUrl: "/pdp-aksay-zhetysu.jpg" },
  "pdp-ryskulbekov-navoi": { title: "ПДП Рыскулбекова / Навои (515 га)", imageUrl: "/pdp-ryskulbekov-navoi.jpg" },
  "pdp-sairan": { title: "ПДП Сайран (977 га)", imageUrl: "/pdp-sairan.jpg" },
};
const DEFAULT_KEY = "genplan-2040";

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

type CornersTuple = [[number, number], [number, number], [number, number], [number, number]];

/** Rigid transform → 4 corners [NW, NE, SE, SW]. Aspect = imgHeight/imgWidth.
 *  Rotation applied in a local metric frame so it stays visually true
 *  despite lng-degree compression at Almaty's latitude. */
function cornersFromTransform(t: Transform, aspect: number): CornersTuple {
  const halfW = (t.widthKm * 1000) / 2;
  const halfH = halfW * aspect;
  const th = (t.rotDeg * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const mLng = mPerDegLng(t.centerLat), mLat = M_PER_DEG_LAT;
  const pts: [number, number][] = [
    [-halfW, halfH], // NW
    [halfW, halfH],  // NE
    [halfW, -halfH], // SE
    [-halfW, -halfH],// SW
  ];
  return pts.map(([x, y]) => {
    const xr = x * cos + y * sin;   // clockwise-positive
    const yr = -x * sin + y * cos;
    return [t.centerLng + xr / mLng, t.centerLat + yr / mLat];
  }) as CornersTuple;
}

/** Existing 4 corners → rigid transform. Height/aspect is intentionally
 *  ignored here (re-derived from the real image), so a stored sheared
 *  rectangle decomposes to the closest rigid placement. */
function transformFromConfig(c: OverlayConfig): Transform {
  const centerLng = (c.nwLon + c.neLon + c.seLon + c.swLon) / 4;
  const centerLat = (c.nwLat + c.neLat + c.seLat + c.swLat) / 4;
  const mLng = mPerDegLng(centerLat), mLat = M_PER_DEG_LAT;
  const dx = (c.neLon - c.nwLon) * mLng;
  const dy = (c.neLat - c.nwLat) * mLat;
  const widthKm = Math.max(0.2, Math.hypot(dx, dy) / 1000);
  const rotDeg = -(Math.atan2(dy, dx) * 180) / Math.PI;
  return { centerLng, centerLat, widthKm, rotDeg };
}

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
  const centerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const handleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const tRef = useRef<Transform | null>(null);
  const aspectRef = useRef<number>(1.5);
  const imageUrlRef = useRef<string>("");

  const [ready, setReady] = useState(false);
  const [t, setT] = useState<Transform | null>(null);
  const [aspect, setAspect] = useState(1.5);
  const [opacity, setOpacity] = useState(0.7);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const initialRef = useRef<Transform | null>(null);

  // Admin gate
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

  // Load config + image aspect together, then mark ready.
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    let cancelled = false;
    setReady(false);

    const apply = (cfg: OverlayConfig) => {
      const tr = transformFromConfig(cfg);
      const img = new window.Image();
      img.onload = () => {
        if (cancelled) return;
        const asp = img.naturalHeight / img.naturalWidth || 1.5;
        aspectRef.current = asp;
        imageUrlRef.current = cfg.imageUrl;
        tRef.current = tr;
        initialRef.current = tr;
        setAspect(asp);
        setT(tr);
        setOpacity(cfg.opacity);
        setReady(true);
      };
      img.onerror = () => {
        if (cancelled) return;
        aspectRef.current = 1.5;
        imageUrlRef.current = cfg.imageUrl;
        tRef.current = tr;
        initialRef.current = tr;
        setT(tr);
        setOpacity(cfg.opacity);
        setReady(true);
      };
      img.src = cfg.imageUrl;
    };

    api.get<OverlayConfig>(`/map-overlays/${KEY}`)
      .then(apply)
      .catch(() => {
        apply({
          key: KEY, imageUrl: meta.imageUrl,
          nwLon: 76.84, nwLat: 43.27, neLon: 76.92, neLat: 43.27,
          seLon: 76.92, seLat: 43.19, swLon: 76.84, swLat: 43.19,
          opacity: 0.7,
        });
      });
    return () => { cancelled = true; };
  }, [user, KEY]);

  // Refresh image source + both markers from the current transform.
  const refresh = () => {
    const map = mapRef.current;
    const tr = tRef.current;
    if (!map || !tr) return;
    const corners = cornersFromTransform(tr, aspectRef.current);
    const src = map.getSource("overlay-img") as maplibregl.ImageSource | undefined;
    if (src) src.setCoordinates(corners);
    centerMarkerRef.current?.setLngLat([tr.centerLng, tr.centerLat]);
    handleMarkerRef.current?.setLngLat(corners[1]); // NE corner
  };

  // Init map + image + 2 markers once config+aspect ready.
  useEffect(() => {
    if (!ready || !t || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [t.centerLng, t.centerLat],
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      const corners = cornersFromTransform(tRef.current!, aspectRef.current);
      map.addSource("overlay-img", {
        type: "image",
        url: imageUrlRef.current,
        coordinates: corners,
      });
      map.addLayer({
        id: "overlay-img",
        type: "raster",
        source: "overlay-img",
        paint: { "raster-opacity": opacity, "raster-fade-duration": 0 },
      });

      // Centre marker (move).
      const cEl = document.createElement("div");
      cEl.style.cssText =
        "width:26px;height:26px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:move;";
      const cMarker = new maplibregl.Marker({ element: cEl, draggable: true })
        .setLngLat([t.centerLng, t.centerLat])
        .addTo(map);
      cMarker.on("drag", () => {
        const ll = cMarker.getLngLat();
        if (!tRef.current) return;
        tRef.current = { ...tRef.current, centerLng: ll.lng, centerLat: ll.lat };
        refresh();
      });
      cMarker.on("dragend", () => setT({ ...(tRef.current as Transform) }));
      centerMarkerRef.current = cMarker;

      // NE handle (resize + rotate around centre).
      const hEl = document.createElement("div");
      hEl.style.cssText =
        "width:22px;height:22px;border-radius:4px;background:#f97316;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:nesw-resize;";
      const hMarker = new maplibregl.Marker({ element: hEl, draggable: true })
        .setLngLat(corners[1])
        .addTo(map);
      hMarker.on("drag", () => {
        const ll = hMarker.getLngLat();
        const cur = tRef.current;
        if (!cur) return;
        const mLng = mPerDegLng(cur.centerLat), mLat = M_PER_DEG_LAT;
        const vx = (ll.lng - cur.centerLng) * mLng;
        const vy = (ll.lat - cur.centerLat) * mLat;
        const d = Math.hypot(vx, vy);                 // half-diagonal in m
        const asp = aspectRef.current;
        const halfW = d / Math.hypot(1, asp);
        const widthKm = Math.max(0.2, (halfW * 2) / 1000);
        const alpha0 = Math.atan2(asp, 1);            // unrotated NE angle
        const rotDeg = ((alpha0 - Math.atan2(vy, vx)) * 180) / Math.PI;
        tRef.current = { ...cur, widthKm, rotDeg };
        refresh();
      });
      hMarker.on("dragend", () => setT({ ...(tRef.current as Transform) }));
      handleMarkerRef.current = hMarker;

      const bounds = new maplibregl.LngLatBounds();
      corners.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 80, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      centerMarkerRef.current = null;
      handleMarkerRef.current = null;
    };
    // `ready` toggles false→true on every overlay switch, so this re-inits
    // the map with the freshly-loaded config + aspect each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Live opacity
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("overlay-img")) return;
    m.setPaintProperty("overlay-img", "raster-opacity", opacity);
  }, [opacity]);

  // Slider/numeric edits → update transform + map
  const setTransform = (patch: Partial<Transform>) => {
    if (!tRef.current) return;
    const next = { ...tRef.current, ...patch };
    tRef.current = next;
    setT(next);
    refresh();
  };

  const save = async () => {
    if (!tRef.current) return;
    setSaving(true);
    try {
      const corners = cornersFromTransform(tRef.current, aspectRef.current);
      const body = {
        imageUrl: imageUrlRef.current,
        nwLon: corners[0][0], nwLat: corners[0][1],
        neLon: corners[1][0], neLat: corners[1][1],
        seLon: corners[2][0], seLat: corners[2][1],
        swLon: corners[3][0], swLat: corners[3][1],
        opacity: Number(opacity),
      };
      await api.put(`/admin/map-overlays/${KEY}`, body);
      setSavedAt(Date.now());
    } catch (e) {
      if (e instanceof ApiUnauthorizedError) {
        alert("Сессия истекла. Перелогинься через хедер и попробуй снова — значения не потеряются.");
        return;
      }
      alert("Не удалось сохранить: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!initialRef.current) return;
    tRef.current = initialRef.current;
    setT(initialRef.current);
    refresh();
  };

  if (authLoading || !user || user.role !== "admin") return null;
  if (!ready || !t) {
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
            <option key={k} value={k}>{m.title}</option>
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

        <aside className="w-[320px] border-l p-4 overflow-y-auto space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="font-semibold">Жёсткая калибровка</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Форма карты фиксирована — двигай, меняй размер и поворачивай,
              пропорции не искажаются.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 mt-1">
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0" />
                <Move className="h-3 w-3 shrink-0" /> синий маркер — перемещение
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-orange-500 shrink-0" />
                <Maximize2 className="h-3 w-3 shrink-0" /> оранжевый — размер + поворот
              </li>
            </ul>
          </div>

          {/* Размер */}
          <div className="border-t pt-3">
            <label className="text-xs font-medium flex items-center gap-1.5 mb-1">
              <Maximize2 className="h-3.5 w-3.5" />
              Ширина: {t.widthKm.toFixed(2)} км
            </label>
            <input
              type="range" min={0.5} max={50} step={0.05}
              value={t.widthKm}
              onChange={(e) => setTransform({ widthKm: parseFloat(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>

          {/* Поворот */}
          <div>
            <label className="text-xs font-medium flex items-center gap-1.5 mb-1">
              <RotateCw className="h-3.5 w-3.5" />
              Поворот: {t.rotDeg.toFixed(1)}° (по часовой)
            </label>
            <input
              type="range" min={-180} max={180} step={0.5}
              value={t.rotDeg}
              onChange={(e) => setTransform({ rotDeg: parseFloat(e.target.value) })}
              className="w-full accent-orange-500"
            />
            <div className="flex gap-1.5 mt-1">
              {[-90, -1, 1, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTransform({ rotDeg: t.rotDeg + d })}
                  className="flex-1 text-[11px] py-1 border rounded hover:bg-muted"
                >
                  {d > 0 ? `+${d}` : d}°
                </button>
              ))}
            </div>
          </div>

          {/* Центр (точные координаты) */}
          <div className="border-t pt-3 space-y-1">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5" />
              Центр (lon · lat)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number" step="0.0005"
                value={t.centerLng.toFixed(5)}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setTransform({ centerLng: v }); }}
                className="text-xs font-mono px-2 py-1 border rounded bg-background"
              />
              <input
                type="number" step="0.0005"
                value={t.centerLat.toFixed(5)}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setTransform({ centerLat: v }); }}
                className="text-xs font-mono px-2 py-1 border rounded bg-background"
              />
            </div>
          </div>

          {/* Прозрачность */}
          <div className="border-t pt-3">
            <label className="text-xs font-medium block mb-1">
              Прозрачность: {(opacity * 100).toFixed(0)}%
            </label>
            <input
              type="range" min={0} max={1} step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="text-[11px] text-muted-foreground border-t pt-3 leading-snug">
            Пропорции зафиксированы по размеру картинки (≈{aspect.toFixed(2)}:1).
            После «Сохранить» изменения появятся на главной карте через ≤60 сек.
          </div>
        </aside>
      </div>
    </div>
  );
}
