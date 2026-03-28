"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, MapPin, X, Search, Sparkles } from "lucide-react";
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

const INITIAL_DATA: InterviewData = {
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

const PROXIMITY_EXAMPLES = [
  "Хочу жить рядом с парком Ганди",
  "Недалеко от школы Tamos Education",
  "Рядом с Mega Alma-Ata",
  "Близко к горам, Медеу",
  "Рядом с метро Байконур",
];

const WORK_LOCATIONS = [
  { label: "Esentai Tower", lat: 43.2183, lng: 76.9268 },
  { label: "Nurly Tau", lat: 43.2334, lng: 76.9435 },
  { label: "Алматы Тауэрс", lat: 43.2380, lng: 76.9450 },
  { label: "Green Tower", lat: 43.2290, lng: 76.9580 },
  { label: "AFD Business Centre", lat: 43.2400, lng: 76.9200 },
  { label: "Mega Alma-Ata", lat: 43.2580, lng: 76.9280 },
  { label: "КБТУ", lat: 43.2294, lng: 76.9449 },
  { label: "КазНУ им. Аль-Фараби", lat: 43.2225, lng: 76.9311 },
  { label: "Барыс Арена", lat: 43.2213, lng: 76.8963 },
  { label: "ТРЦ Dostyk Plaza", lat: 43.2328, lng: 76.9555 },
  { label: "Центр города (пр. Абая / Назарбаева)", lat: 43.2400, lng: 76.9450 },
];

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

const STEPS = [
  { title: "Район", description: "Где вы хотите жить?" },
  { title: "Квартира", description: "Какую квартиру ищете?" },
  { title: "Площадь", description: "Какая площадь вам нужна?" },
  { title: "Работа", description: "Где вы работаете?" },
  { title: "Пробки", description: "Как добираетесь на работу?" },
  { title: "Окружение", description: "Рядом с чем вы хотите жить?" },
  { title: "Застройщик", description: "Есть предпочтения по застройщикам?" },
  { title: "Бюджет", description: "Какой у вас бюджет?" },
  { title: "Итого", description: "Проверьте ваши параметры" },
];

function generateProjectName(data: InterviewData): string {
  const parts: string[] = [];

  // Rooms
  if (data.rooms.length > 0) {
    const sorted = [...data.rooms].sort();
    parts.push(sorted.map((r) => `${r}-комн`).join(", "));
  }

  // Districts (short)
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

  // Budget short
  const budgetMin = Math.round(data.budgetMin / 1000000);
  const budgetMax = Math.round(data.budgetMax / 1000000);
  parts.push(`${budgetMin}-${budgetMax}М`);

  return parts.join(" \u00b7 ");
}

/** Format number with spaces: 95000000 -> "95 000 000" */
function formatNum(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Parse number from formatted string: "95 000 000" -> 95000000 */
function parseNum(s: string): number {
  return parseInt(s.replace(/\s/g, "")) || 0;
}

interface Props {
  onComplete: (data: Record<string, unknown>, name: string) => Promise<void>;
}

export function InterviewWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<InterviewData>(INITIAL_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customWork, setCustomWork] = useState("");
  const [isCustomWork, setIsCustomWork] = useState(false);
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [isCustomBudget, setIsCustomBudget] = useState(false);
  const [isGeocodingWork, setIsGeocodingWork] = useState(false);
  const [customDevPattern, setCustomDevPattern] = useState("");
  const [proximityQuery, setProximityQuery] = useState("");
  const [isGeocodingProximity, setIsGeocodingProximity] = useState(false);
  const [proximityError, setProximityError] = useState("");

  const toggleArray = (key: keyof InterviewData, value: string | number) => {
    setData((prev) => {
      const arr = prev[key] as (string | number)[];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return data.districts.length > 0;
      case 1: return data.rooms.length > 0;
      case 2: return data.areaMin > 0 && data.areaMax > data.areaMin;
      case 3: return data.workLocation.label !== "";
      case 4: return !!data.commuteMode;
      case 5: return true; // lifestyle + proximity is optional
      case 6: return true; // developer filter is optional
      case 7: return data.budgetMin > 0;
      case 8: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const name = generateProjectName(data);
      await onComplete(data as unknown as Record<string, unknown>, name);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Geocode a text address using 2GIS Suggest API */
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
        const lat = point.lat || 43.238;
        const lng = point.lon || point.lng || 76.945;
        const label = item.name || text;
        setData((prev) => ({
          ...prev,
          workLocation: { lat, lng, label },
        }));
      } else {
        // Fallback: save label without coords
        setData((prev) => ({
          ...prev,
          workLocation: { lat: 43.238, lng: 76.945, label: text },
        }));
      }
    } catch {
      setData((prev) => ({
        ...prev,
        workLocation: { lat: 43.238, lng: 76.945, label: text },
      }));
    } finally {
      setIsGeocodingWork(false);
    }
  };

  /** Geocode a proximity location and add to the list */
  const addProximityLocation = async (rawQuery: string) => {
    const text = rawQuery.trim()
      .replace(/^(хочу жить рядом с|рядом с|недалеко от|близко к|поблизости от|около)\s*/i, "")
      .replace(/^(ищу квартиру|ищу жильё|ищу)\s*(рядом с|поблизости от|недалеко от|около)?\s*/i, "")
      .trim();
    if (!text) return;

    setIsGeocodingProximity(true);
    setProximityError("");
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
        const lat = point.lat || 0;
        const lng = point.lon || point.lng || 0;
        const name = item.name || text;

        // Check for duplicates
        const isDupe = data.proximityLocations.some(
          (loc) => loc.name.toLowerCase() === name.toLowerCase(),
        );
        if (!isDupe) {
          setData((prev) => ({
            ...prev,
            proximityLocations: [
              ...prev.proximityLocations,
              { name, lat, lng, radiusKm: 3 },
            ],
          }));
        }
        setProximityQuery("");
      } else {
        setProximityError(`Не удалось найти "${text}" в Алматы. Попробуйте другое название.`);
      }
    } catch {
      setProximityError("Ошибка при поиске. Попробуйте ещё раз.");
    } finally {
      setIsGeocodingProximity(false);
    }
  };

  const removeProximityLocation = (name: string) => {
    setData((prev) => ({
      ...prev,
      proximityLocations: prev.proximityLocations.filter((loc) => loc.name !== name),
    }));
  };

  const updateProximityRadius = (name: string, radiusKm: number) => {
    setData((prev) => ({
      ...prev,
      proximityLocations: prev.proximityLocations.map((loc) =>
        loc.name === name ? { ...loc, radiusKm } : loc,
      ),
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="grid grid-cols-2 gap-3">
            {ALMATY_DISTRICTS.map((d) => (
              <button
                key={d.value}
                onClick={() => toggleArray("districts", d.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  data.districts.includes(d.value)
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-3">Количество комнат</h4>
              <div className="flex gap-3">
                {ROOM_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => toggleArray("rooms", r.value)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      data.rooms.includes(r.value)
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-3">Тип дома</h4>
              <div className="flex flex-wrap gap-3">
                {BUILDING_TYPES.map((b) => (
                  <button
                    key={b.value}
                    onClick={() => toggleArray("buildingType", b.value)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
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
              <h4 className="text-sm font-medium mb-3">Состояние</h4>
              <div className="flex flex-wrap gap-3">
                {CONDITION_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => toggleArray("condition", c.value)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
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
        );

      case 2:
        return (
          <div className="space-y-4">
            {/* Preset buttons */}
            <div className="grid grid-cols-2 gap-3">
              {AREA_PRESETS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    setData({ ...data, areaMin: a.min, areaMax: a.max });
                    setIsCustomArea(false);
                  }}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    !isCustomArea && data.areaMin === a.min && data.areaMax === a.max
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {/* Custom input toggle */}
            <div className="border-t pt-4">
              <button
                onClick={() => setIsCustomArea(!isCustomArea)}
                className={`text-sm font-medium transition-colors ${
                  isCustomArea ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isCustomArea ? "← К пресетам" : "Указать точные значения"}
              </button>

              {isCustomArea && (
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">От, м²</label>
                    <input
                      type="number"
                      value={data.areaMin || ""}
                      onChange={(e) =>
                        setData({ ...data, areaMin: parseInt(e.target.value) || 0 })
                      }
                      placeholder="например, 85"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">—</span>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">До, м²</label>
                    <input
                      type="number"
                      value={data.areaMax || ""}
                      onChange={(e) =>
                        setData({ ...data, areaMax: parseInt(e.target.value) || 0 })
                      }
                      placeholder="например, 120"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            {/* Popular locations */}
            <div className="space-y-2">
              {WORK_LOCATIONS.map((loc) => (
                <button
                  key={loc.label}
                  onClick={() => {
                    setData({
                      ...data,
                      workLocation: { lat: loc.lat, lng: loc.lng, label: loc.label },
                    });
                    setIsCustomWork(false);
                    setCustomWork("");
                  }}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    !isCustomWork && data.workLocation.label === loc.label
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {loc.label}
                </button>
              ))}
            </div>

            {/* Custom location input */}
            <div className="border-t pt-4">
              <button
                onClick={() => setIsCustomWork(!isCustomWork)}
                className={`text-sm font-medium transition-colors ${
                  isCustomWork ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isCustomWork ? "← К списку" : "Указать своё место работы"}
              </button>

              {isCustomWork && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customWork}
                      onChange={(e) => setCustomWork(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customWork.trim()) {
                          geocodeWorkLocation(customWork);
                        }
                      }}
                      placeholder="Введите адрес, район или название (напр. Мамыр)"
                      className="flex-1 px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => geocodeWorkLocation(customWork)}
                      disabled={!customWork.trim() || isGeocodingWork}
                    >
                      <MapPin className="h-4 w-4 mr-1" />
                      {isGeocodingWork ? "..." : "Найти"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Введите название района, улицу, ТРЦ или любой ориентир в Алматы
                  </p>
                  {data.workLocation.label && isCustomWork && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm text-green-700">
                      <MapPin className="h-4 w-4" />
                      <span>Найдено: {data.workLocation.label}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-3">Способ передвижения</h4>
              <div className="flex gap-3">
                {COMMUTE_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setData({ ...data, commuteMode: m.value })}
                    className={`flex-1 p-3 rounded-lg border text-center transition-colors ${
                      data.commuteMode === m.value
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-3">Максимальное время в пути</h4>
              <div className="grid grid-cols-3 gap-3">
                {COMMUTE_TIME_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setData({ ...data, commuteMaxMinutes: t.value })}
                    className={`p-3 rounded-lg border text-center transition-colors ${
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
        );

      case 5:
        return (
          <div className="space-y-6">
            {/* Proximity search — the engaging part */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-medium">Хочу жить рядом с...</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Укажите конкретное место — парк, школу, ТРЦ, метро — и мы найдём квартиры поблизости
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={proximityQuery}
                  onChange={(e) => {
                    setProximityQuery(e.target.value);
                    setProximityError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && proximityQuery.trim()) {
                      addProximityLocation(proximityQuery);
                    }
                  }}
                  placeholder="напр. парк Ганди, школа Tamos, метро Байконур..."
                  className="flex-1 px-3 py-2.5 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => addProximityLocation(proximityQuery)}
                  disabled={!proximityQuery.trim() || isGeocodingProximity}
                  className="px-4"
                >
                  <Search className="h-4 w-4 mr-1" />
                  {isGeocodingProximity ? "..." : "Найти"}
                </Button>
              </div>

              {proximityError && (
                <p className="text-sm text-red-500 mt-2">{proximityError}</p>
              )}

              {/* Example queries */}
              {data.proximityLocations.length === 0 && !proximityQuery && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Примеры запросов:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PROXIMITY_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setProximityQuery(ex)}
                        className="px-2.5 py-1 rounded-full bg-muted text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved proximity locations */}
              {data.proximityLocations.length > 0 && (
                <div className="space-y-2 mt-4">
                  {data.proximityLocations.map((loc) => (
                    <div
                      key={loc.name}
                      className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200"
                    >
                      <MapPin className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-green-800 truncate block">
                          {loc.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-xs text-green-700">Радиус:</label>
                        <select
                          value={loc.radiusKm}
                          onChange={(e) =>
                            updateProximityRadius(loc.name, Number(e.target.value))
                          }
                          className="px-2 py-1 rounded border border-green-300 text-xs bg-white text-green-800"
                        >
                          <option value={1}>1 км</option>
                          <option value={2}>2 км</option>
                          <option value={3}>3 км</option>
                          <option value={5}>5 км</option>
                          <option value={7}>7 км</option>
                          <option value={10}>10 км</option>
                        </select>
                      </div>
                      <button
                        onClick={() => removeProximityLocation(loc.name)}
                        className="text-green-500 hover:text-red-500 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lifestyle chips — secondary, collapsible */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                Что ещё важно рядом с домом?
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {LIFESTYLE_OPTIONS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => toggleArray("lifestyle", l.value)}
                    className={`px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                      data.lifestyle.includes(l.value)
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50 text-muted-foreground"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 6: {
        const devFilter = data.developerFilter;
        const toggleDeveloper = (devValue: string) => {
          const devs = devFilter.developers.includes(devValue)
            ? devFilter.developers.filter((d) => d !== devValue)
            : [...devFilter.developers, devValue];
          setData({
            ...data,
            developerFilter: { ...devFilter, developers: devs },
          });
        };
        const setMode = (mode: "include" | "exclude") => {
          setData({
            ...data,
            developerFilter: { ...devFilter, mode },
          });
        };
        const addCustomPattern = () => {
          const trimmed = customDevPattern.trim();
          if (trimmed && !devFilter.customPatterns.includes(trimmed)) {
            setData({
              ...data,
              developerFilter: {
                ...devFilter,
                customPatterns: [...devFilter.customPatterns, trimmed],
              },
            });
            setCustomDevPattern("");
          }
        };
        const removeCustomPattern = (pat: string) => {
          setData({
            ...data,
            developerFilter: {
              ...devFilter,
              customPatterns: devFilter.customPatterns.filter((p) => p !== pat),
            },
          });
        };
        const hasSelections =
          devFilter.developers.length > 0 || devFilter.customPatterns.length > 0;

        return (
          <div className="space-y-5">
            {/* Skip hint */}
            <p className="text-sm text-muted-foreground">
              Можно пропустить этот шаг, если нет предпочтений
            </p>

            {/* Mode toggle */}
            <div>
              <h4 className="text-sm font-medium mb-2">Режим фильтра</h4>
              <div className="flex gap-3">
                <button
                  onClick={() => setMode("include")}
                  className={`flex-1 p-3 rounded-lg border text-center text-sm transition-colors ${
                    devFilter.mode === "include"
                      ? "border-green-500 bg-green-50 text-green-700 font-medium"
                      : "border-border hover:border-green-300"
                  }`}
                >
                  Искать только у выбранных
                </button>
                <button
                  onClick={() => setMode("exclude")}
                  className={`flex-1 p-3 rounded-lg border text-center text-sm transition-colors ${
                    devFilter.mode === "exclude"
                      ? "border-red-500 bg-red-50 text-red-700 font-medium"
                      : "border-border hover:border-red-300"
                  }`}
                >
                  Исключить выбранных
                </button>
              </div>
            </div>

            {/* Developer chips */}
            <div>
              <h4 className="text-sm font-medium mb-2">Застройщики</h4>
              <div className="flex flex-wrap gap-2">
                {ALMATY_DEVELOPERS.map((dev) => {
                  const isSelected = devFilter.developers.includes(dev.value);
                  const borderColor =
                    devFilter.mode === "exclude"
                      ? isSelected
                        ? "border-red-500 bg-red-50 text-red-700 font-medium"
                        : "border-border hover:border-red-300"
                      : isSelected
                        ? "border-green-500 bg-green-50 text-green-700 font-medium"
                        : "border-border hover:border-green-300";
                  return (
                    <button
                      key={dev.value}
                      onClick={() => toggleDeveloper(dev.value)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${borderColor}`}
                    >
                      {isSelected && devFilter.mode === "exclude" ? "✕ " : ""}
                      {isSelected && devFilter.mode === "include" ? "✓ " : ""}
                      {dev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom pattern input */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">
                Добавить свой ЖК или застройщика
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDevPattern}
                  onChange={(e) => setCustomDevPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCustomPattern();
                  }}
                  placeholder="напр. Rams City, Алтын Орда..."
                  className="flex-1 px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCustomPattern}
                  disabled={!customDevPattern.trim()}
                >
                  Добавить
                </Button>
              </div>

              {/* Custom patterns list */}
              {devFilter.customPatterns.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {devFilter.customPatterns.map((pat) => (
                    <span
                      key={pat}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                        devFilter.mode === "exclude"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-green-50 text-green-700 border border-green-200"
                      }`}
                    >
                      {pat}
                      <button
                        onClick={() => removeCustomPattern(pat)}
                        className="ml-1 hover:opacity-70"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Summary of current filter */}
            {hasSelections && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  devFilter.mode === "exclude"
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-green-50 text-green-700 border border-green-200"
                }`}
              >
                {devFilter.mode === "include"
                  ? "Будут показаны только ЖК от выбранных застройщиков"
                  : "ЖК от выбранных застройщиков будут исключены из результатов"}
              </div>
            )}
          </div>
        );
      }

      case 7:
        return (
          <div className="space-y-4">
            {/* Preset buttons */}
            <div className="grid grid-cols-2 gap-3">
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b.label}
                  onClick={() => {
                    setData({ ...data, budgetMin: b.min, budgetMax: b.max });
                    setIsCustomBudget(false);
                  }}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    !isCustomBudget && data.budgetMin === b.min && data.budgetMax === b.max
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Custom budget input */}
            <div className="border-t pt-4">
              <button
                onClick={() => setIsCustomBudget(!isCustomBudget)}
                className={`text-sm font-medium transition-colors ${
                  isCustomBudget ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isCustomBudget ? "← К пресетам" : "Указать точную сумму"}
              </button>

              {isCustomBudget && (
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">От, тенге</label>
                    <input
                      type="text"
                      value={data.budgetMin ? formatNum(data.budgetMin) : ""}
                      onChange={(e) =>
                        setData({ ...data, budgetMin: parseNum(e.target.value) })
                      }
                      placeholder="напр. 50 000 000"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.budgetMin > 0 ? `${(data.budgetMin / 1000000).toFixed(1)} млн` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground mt-3">—</span>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">До, тенге</label>
                    <input
                      type="text"
                      value={data.budgetMax ? formatNum(data.budgetMax) : ""}
                      onChange={(e) =>
                        setData({ ...data, budgetMax: parseNum(e.target.value) })
                      }
                      placeholder="напр. 95 000 000"
                      className="w-full px-3 py-2 rounded-lg border border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.budgetMax > 0 ? `${(data.budgetMax / 1000000).toFixed(1)} млн` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 8: {
        // Build developer filter summary
        const df = data.developerFilter;
        const devNames = [
          ...df.developers.map(
            (d) => ALMATY_DEVELOPERS.find((x) => x.value === d)?.label || d,
          ),
          ...df.customPatterns,
        ];
        const devSummary =
          devNames.length > 0
            ? `${df.mode === "exclude" ? "Исключены" : "Только"}: ${devNames.join(", ")}`
            : "Без фильтра";

        return (
          <div className="space-y-4">
            <SummaryRow label="Районы" value={data.districts.map((d) => ALMATY_DISTRICTS.find((x) => x.value === d)?.label).join(", ")} />
            <SummaryRow label="Комнаты" value={data.rooms.join(", ")} />
            <SummaryRow label="Площадь" value={`${data.areaMin}–${data.areaMax} м²`} />
            <SummaryRow label="Работа" value={data.workLocation.label} />
            <SummaryRow label="Транспорт" value={COMMUTE_MODES.find((m) => m.value === data.commuteMode)?.label || ""} />
            <SummaryRow label="Макс. время" value={`${data.commuteMaxMinutes} мин`} />
            <SummaryRow
              label="Рядом с"
              value={
                data.proximityLocations.length > 0
                  ? data.proximityLocations.map((loc) => `${loc.name} (${loc.radiusKm} км)`).join(", ")
                  : "—"
              }
            />
            <SummaryRow
              label="Lifestyle"
              value={data.lifestyle.length > 0
                ? data.lifestyle.map((l) => LIFESTYLE_OPTIONS.find((x) => x.value === l)?.label).join(", ")
                : "—"
              }
            />
            <SummaryRow label="Застройщик" value={devSummary} />
            <SummaryRow label="Бюджет" value={`${(data.budgetMin / 1000000).toFixed(1)}–${(data.budgetMax / 1000000).toFixed(1)} млн тг`} />
          </div>
        );
      }
    }
  };

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        Шаг {step + 1} из {STEPS.length}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].title}</CardTitle>
          <CardDescription>{STEPS[step].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Назад
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Далее
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Сохранение..." : "Начать поиск"}
                <Check className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
