"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Search,
  Loader2,
} from "lucide-react";
import {
  ALMATY_DISTRICTS,
  ROOM_OPTIONS,
  BUILDING_TYPES,
  CONDITION_OPTIONS,
  LIFESTYLE_OPTIONS,
  COMMUTE_MODES,
  COMMUTE_TIME_OPTIONS,
  ALMATY_DEVELOPERS,
} from "@dreamapt/shared";
import type { DeveloperFilter } from "@dreamapt/shared";

interface ProximityLoc {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

interface InterviewData {
  districts: string[];
  rooms: number[];
  buildingType: string[];
  condition: string[];
  areaMin: number;
  areaMax: number;
  workLocation: { lat: number; lng: number; label: string };
  commuteMode: string;
  commuteMaxMinutes: number;
  lifestyle: string[];
  proximityLocations: ProximityLoc[];
  budgetMin: number;
  budgetMax: number;
  developerFilter: DeveloperFilter;
}

const BUDGET_PRESETS = [
  { label: "15-25 млн", min: 15000000, max: 25000000 },
  { label: "25-35 млн", min: 25000000, max: 35000000 },
  { label: "35-50 млн", min: 35000000, max: 50000000 },
  { label: "50-70 млн", min: 50000000, max: 70000000 },
  { label: "70-100 млн", min: 70000000, max: 100000000 },
  { label: "100+ млн", min: 100000000, max: 200000000 },
];

const AREA_PRESETS = [
  { label: "30-50 м²", min: 30, max: 50 },
  { label: "50-70 м²", min: 50, max: 70 },
  { label: "70-90 м²", min: 70, max: 90 },
  { label: "90-120 м²", min: 90, max: 120 },
  { label: "120-150 м²", min: 120, max: 150 },
  { label: "150+ м²", min: 150, max: 250 },
];

const WORK_LOCATIONS = [
  { label: "Esentai Tower", lat: 43.2183, lng: 76.9268 },
  { label: "Nurly Tau", lat: 43.2334, lng: 76.9435 },
  { label: "Алматы Тауэрс", lat: 43.238, lng: 76.945 },
  { label: "Green Tower", lat: 43.229, lng: 76.958 },
  { label: "AFD Business Centre", lat: 43.24, lng: 76.92 },
  { label: "Mega Alma-Ata", lat: 43.258, lng: 76.928 },
  { label: "Центр города", lat: 43.24, lng: 76.945 },
];

function formatNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseNum(s: string): number {
  return parseInt(s.replace(/\s/g, "")) || 0;
}

interface EditSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: Record<string, unknown> | null;
  onApply: (data: Record<string, unknown>, name: string) => Promise<void>;
}

function generateProjectName(data: InterviewData): string {
  const parts: string[] = [];
  if (data.rooms.length > 0) {
    const sorted = [...data.rooms].sort();
    parts.push(sorted.map((r) => `${r}-комн`).join(", "));
  }
  if (data.districts.length > 0) {
    const districtLabels = data.districts
      .slice(0, 2)
      .map((d) => ALMATY_DISTRICTS.find((x) => x.value === d)?.label || d)
      .map((label) => label.replace(/ский$|ный$|кий$/, "").trim());
    parts.push(districtLabels.join(", "));
    if (data.districts.length > 2) {
      parts.push(`+${data.districts.length - 2}`);
    }
  }
  const budgetMin = Math.round(data.budgetMin / 1000000);
  const budgetMax = Math.round(data.budgetMax / 1000000);
  parts.push(`${budgetMin}-${budgetMax}М`);
  return parts.join(" · ");
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-0">
      <button
        className="flex items-center justify-between w-full py-3 text-sm font-medium hover:text-primary transition-colors"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export function EditSearchDialog({
  isOpen,
  onClose,
  initialData,
  onApply,
}: EditSearchDialogProps) {
  const defaults: InterviewData = {
    districts: [],
    rooms: [],
    buildingType: [],
    condition: [],
    areaMin: 40,
    areaMax: 120,
    workLocation: { lat: 43.238, lng: 76.945, label: "" },
    commuteMode: "car",
    commuteMaxMinutes: 30,
    lifestyle: [],
    proximityLocations: [],
    budgetMin: 15000000,
    budgetMax: 60000000,
    developerFilter: { mode: "include", developers: [], customPatterns: [] },
  };

  const [data, setData] = useState<InterviewData>(defaults);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customWork, setCustomWork] = useState("");
  const [isGeocodingWork, setIsGeocodingWork] = useState(false);
  const [proximityQuery, setProximityQuery] = useState("");
  const [isGeocodingProximity, setIsGeocodingProximity] = useState(false);

  useEffect(() => {
    if (initialData && isOpen) {
      setData({
        ...defaults,
        ...(initialData as unknown as Partial<InterviewData>),
      });
    }
  }, [initialData, isOpen]);

  const toggleArray = (key: keyof InterviewData, value: string | number) => {
    setData((prev) => {
      const arr = prev[key] as (string | number)[];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const geocodeWorkLocation = async (text: string) => {
    if (!text.trim()) return;
    setIsGeocodingWork(true);
    try {
      const q = encodeURIComponent(text + " Алматы");
      const res = await fetch(
        `https://catalog.api.2gis.com/3.0/items?q=${q}&fields=items.point&key=rubnkm7490`,
      );
      const json = await res.json();
      const items = json.result?.items;
      if (items?.length > 0) {
        const item = items[0];
        const point = item.point || {};
        setData((prev) => ({
          ...prev,
          workLocation: {
            lat: point.lat || 43.238,
            lng: point.lon || point.lng || 76.945,
            label: item.name || text,
          },
        }));
      }
    } catch {
      // ignore
    } finally {
      setIsGeocodingWork(false);
    }
  };

  const addProximityLocation = async (rawQuery: string) => {
    const text = rawQuery
      .trim()
      .replace(
        /^(хочу жить рядом с|рядом с|недалеко от|близко к|около)\s*/i,
        "",
      )
      .trim();
    if (!text) return;
    setIsGeocodingProximity(true);
    try {
      const q = encodeURIComponent(text + " Алматы");
      const res = await fetch(
        `https://catalog.api.2gis.com/3.0/items?q=${q}&fields=items.point&key=rubnkm7490`,
      );
      const json = await res.json();
      const items = json.result?.items;
      if (items?.length > 0) {
        const item = items[0];
        const point = item.point || {};
        const name = item.name || text;
        const isDupe = data.proximityLocations.some(
          (loc) => loc.name.toLowerCase() === name.toLowerCase(),
        );
        if (!isDupe) {
          setData((prev) => ({
            ...prev,
            proximityLocations: [
              ...prev.proximityLocations,
              {
                name,
                lat: point.lat || 0,
                lng: point.lon || point.lng || 0,
                radiusKm: 3,
              },
            ],
          }));
        }
        setProximityQuery("");
      }
    } catch {
      // ignore
    } finally {
      setIsGeocodingProximity(false);
    }
  };

  const handleApply = async () => {
    setIsSubmitting(true);
    try {
      const name = generateProjectName(data);
      await onApply(data as unknown as Record<string, unknown>, name);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b z-10 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Параметры поиска</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          {/* Districts */}
          <Section title="Районы" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-2">
              {ALMATY_DISTRICTS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => toggleArray("districts", d.value)}
                  className={`p-2 rounded-lg border text-left text-sm transition-colors ${
                    data.districts.includes(d.value)
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Rooms */}
          <Section title="Комнаты" defaultOpen={true}>
            <div className="flex gap-2 flex-wrap">
              {ROOM_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => toggleArray("rooms", r.value)}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    data.rooms.includes(r.value)
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Building Type & Condition */}
          <Section title="Тип дома и состояние">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Тип дома</p>
                <div className="flex flex-wrap gap-2">
                  {BUILDING_TYPES.map((b) => (
                    <button
                      key={b.value}
                      onClick={() => toggleArray("buildingType", b.value)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        data.buildingType.includes(b.value)
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Состояние</p>
                <div className="flex flex-wrap gap-2">
                  {CONDITION_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => toggleArray("condition", c.value)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        data.condition.includes(c.value)
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Area */}
          <Section title="Площадь" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {AREA_PRESETS.map((a) => (
                <button
                  key={a.label}
                  onClick={() =>
                    setData({ ...data, areaMin: a.min, areaMax: a.max })
                  }
                  className={`p-2 rounded-lg border text-center text-sm transition-colors ${
                    data.areaMin === a.min && data.areaMax === a.max
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={data.areaMin || ""}
                onChange={(e) =>
                  setData({ ...data, areaMin: parseInt(e.target.value) || 0 })
                }
                placeholder="От"
                className="flex-1 px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
              />
              <span className="text-muted-foreground">—</span>
              <input
                type="number"
                value={data.areaMax || ""}
                onChange={(e) =>
                  setData({ ...data, areaMax: parseInt(e.target.value) || 0 })
                }
                placeholder="До"
                className="flex-1 px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">м²</span>
            </div>
          </Section>

          {/* Work location */}
          <Section title="Место работы">
            <div className="space-y-2">
              {data.workLocation.label && (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm text-green-700 mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>Текущее: {data.workLocation.label}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {WORK_LOCATIONS.map((loc) => (
                  <button
                    key={loc.label}
                    onClick={() =>
                      setData({
                        ...data,
                        workLocation: {
                          lat: loc.lat,
                          lng: loc.lng,
                          label: loc.label,
                        },
                      })
                    }
                    className={`p-2 rounded-lg border text-left text-sm transition-colors ${
                      data.workLocation.label === loc.label
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customWork}
                  onChange={(e) => setCustomWork(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customWork.trim()) {
                      geocodeWorkLocation(customWork);
                    }
                  }}
                  placeholder="Или введите своё место"
                  className="flex-1 px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => geocodeWorkLocation(customWork)}
                  disabled={!customWork.trim() || isGeocodingWork}
                >
                  {isGeocodingWork ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </Section>

          {/* Commute */}
          <Section title="Транспорт">
            <div className="space-y-3">
              <div className="flex gap-2">
                {COMMUTE_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setData({ ...data, commuteMode: m.value })}
                    className={`flex-1 p-2 rounded-lg border text-center text-sm transition-colors ${
                      data.commuteMode === m.value
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Макс. время в пути
                </p>
                <div className="flex gap-2 flex-wrap">
                  {COMMUTE_TIME_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() =>
                        setData({ ...data, commuteMaxMinutes: t.value })
                      }
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        data.commuteMaxMinutes === t.value
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Proximity */}
          <Section title="Рядом с...">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={proximityQuery}
                  onChange={(e) => setProximityQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && proximityQuery.trim()) {
                      addProximityLocation(proximityQuery);
                    }
                  }}
                  placeholder="парк, школа, метро..."
                  className="flex-1 px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addProximityLocation(proximityQuery)}
                  disabled={!proximityQuery.trim() || isGeocodingProximity}
                >
                  {isGeocodingProximity ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {data.proximityLocations.length > 0 && (
                <div className="space-y-2">
                  {data.proximityLocations.map((loc) => (
                    <div
                      key={loc.name}
                      className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200"
                    >
                      <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="text-sm text-green-800 flex-1 truncate">
                        {loc.name}
                      </span>
                      <select
                        value={loc.radiusKm}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            proximityLocations: prev.proximityLocations.map(
                              (l) =>
                                l.name === loc.name
                                  ? { ...l, radiusKm: Number(e.target.value) }
                                  : l,
                            ),
                          }))
                        }
                        className="px-1.5 py-0.5 rounded border text-xs bg-white"
                      >
                        <option value={1}>1 км</option>
                        <option value={2}>2 км</option>
                        <option value={3}>3 км</option>
                        <option value={5}>5 км</option>
                        <option value={10}>10 км</option>
                      </select>
                      <button
                        onClick={() =>
                          setData((prev) => ({
                            ...prev,
                            proximityLocations:
                              prev.proximityLocations.filter(
                                (l) => l.name !== loc.name,
                              ),
                          }))
                        }
                        className="text-green-500 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Lifestyle */}
          <Section title="Образ жизни">
            <div className="grid grid-cols-2 gap-2">
              {LIFESTYLE_OPTIONS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => toggleArray("lifestyle", l.value)}
                  className={`px-3 py-1.5 rounded-lg border text-left text-sm transition-colors ${
                    data.lifestyle.includes(l.value)
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Budget */}
          <Section title="Бюджет" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b.label}
                  onClick={() =>
                    setData({ ...data, budgetMin: b.min, budgetMax: b.max })
                  }
                  className={`p-2 rounded-lg border text-center text-sm transition-colors ${
                    data.budgetMin === b.min && data.budgetMax === b.max
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={data.budgetMin ? formatNum(data.budgetMin) : ""}
                  onChange={(e) =>
                    setData({ ...data, budgetMin: parseNum(e.target.value) })
                  }
                  placeholder="От"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
                />
                {data.budgetMin > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(data.budgetMin / 1000000).toFixed(1)} млн
                  </p>
                )}
              </div>
              <span className="text-muted-foreground">—</span>
              <div className="flex-1">
                <input
                  type="text"
                  value={data.budgetMax ? formatNum(data.budgetMax) : ""}
                  onChange={(e) =>
                    setData({ ...data, budgetMax: parseNum(e.target.value) })
                  }
                  placeholder="До"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:border-primary focus:outline-none"
                />
                {data.budgetMax > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(data.budgetMax / 1000000).toFixed(1)} млн
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Developer Filter */}
          <Section title="Застройщик">
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setData({
                      ...data,
                      developerFilter: {
                        ...data.developerFilter,
                        mode: "include",
                      },
                    })
                  }
                  className={`flex-1 p-2 rounded-lg border text-center text-sm transition-colors ${
                    data.developerFilter.mode === "include"
                      ? "border-green-500 bg-green-50 text-green-700 font-medium"
                      : "border-border hover:border-green-300"
                  }`}
                >
                  Только выбранные
                </button>
                <button
                  onClick={() =>
                    setData({
                      ...data,
                      developerFilter: {
                        ...data.developerFilter,
                        mode: "exclude",
                      },
                    })
                  }
                  className={`flex-1 p-2 rounded-lg border text-center text-sm transition-colors ${
                    data.developerFilter.mode === "exclude"
                      ? "border-red-500 bg-red-50 text-red-700 font-medium"
                      : "border-border hover:border-red-300"
                  }`}
                >
                  Исключить
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALMATY_DEVELOPERS.map((dev) => {
                  const isSelected =
                    data.developerFilter.developers.includes(dev.value);
                  const mode = data.developerFilter.mode;
                  return (
                    <button
                      key={dev.value}
                      onClick={() => {
                        const devs = isSelected
                          ? data.developerFilter.developers.filter(
                              (d) => d !== dev.value,
                            )
                          : [...data.developerFilter.developers, dev.value];
                        setData({
                          ...data,
                          developerFilter: {
                            ...data.developerFilter,
                            developers: devs,
                          },
                        });
                      }}
                      className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                        isSelected
                          ? mode === "exclude"
                            ? "border-red-500 bg-red-50 text-red-700 font-medium"
                            : "border-green-500 bg-green-50 text-green-700 font-medium"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {dev.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4">
          <Button
            className="w-full"
            onClick={handleApply}
            disabled={
              isSubmitting || data.districts.length === 0 || data.rooms.length === 0
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Запускаем поиск...
              </>
            ) : (
              "Применить изменения"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
