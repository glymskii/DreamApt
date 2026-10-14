"use client";

import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { FeatureToggle } from "./FeatureToggle";
import { mapFeatures, type MapFeature } from "./feature-style";
import { newBuildingSince } from "@/lib/construction";

export function FeaturePanel({ active, onToggle, buildingCount, newCount, hasGenplan = true, preview = false }: {
  active: Record<MapFeature, boolean>;
  onToggle?: (feature: MapFeature) => void;
  buildingCount?: number;
  newCount?: number;
  hasGenplan?: boolean;
  preview?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = (feature: MapFeature) => (
    <FeatureToggle key={feature} feature={feature} active={active[feature]} onToggle={() => onToggle?.(feature)}
      count={feature === "building" ? buildingCount : feature === "new" ? newCount : undefined}
      disabled={feature === "genplan" && !hasGenplan} />
  );
  return (
    <section aria-label={t("map.featuresTitle")} className="relative shrink-0 border-b bg-card p-2 sm:px-3">
      <div className={`grid gap-2 ${preview ? "" : "xl:grid-cols-[3fr_2fr]"}`}>
        <div role="group" aria-label={t("map.layerGroup")} className="grid grid-cols-3 gap-1.5">
          {(["seismic", "air", "genplan"] as const).map(toggle)}
        </div>
        <div role="group" aria-label={t("map.stageGroup")} className="grid grid-cols-2 gap-1.5">
          {(["building", "new"] as const).map(toggle)}
        </div>
      </div>
      {!preview && (
        <details className="group mt-1 hidden sm:block">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Info className="h-4 w-4" />{t("map.featuresHelp")}
          </summary>
          <div className="absolute left-2 right-2 top-full z-20 max-h-[40dvh] overflow-y-auto rounded-xl border bg-card p-3 shadow-xl">
            <p className="mb-3 text-xs font-medium">{t("map.layerFilterHint")}</p>
            <dl className="space-y-3">
              {(Object.keys(mapFeatures) as MapFeature[]).map((feature) => {
                const { icon: Icon, label, hint, className } = mapFeatures[feature];
                return <div key={feature}>
                  <dt className={`flex items-center gap-2 text-xs font-semibold ${className}`}><Icon className="h-4 w-4" />{t(label)}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{t(hint, { year: newBuildingSince() })}</dd>
                </div>;
              })}
            </dl>
          </div>
        </details>
      )}
    </section>
  );
}
