"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Wind, LandPlot, Construction, House, ChevronDown, Info } from "lucide-react";
import { mapFeatures, type MapFeature } from "./feature-style";
import { newBuildingSince } from "@/lib/construction";

const riskLevels = ["safe", "low", "moderate", "high", "critical"] as const;
const riskDots = ["bg-risk-safe", "bg-risk-low", "bg-risk-moderate", "bg-risk-high", "bg-risk-critical"];
const riskLabels = ["map.legendSafe", "sidebar.riskLow", "map.legendModerate", "map.legendHigh", "map.legendCritical"];
const airRings = ["border-risk-safe", "border-risk-moderate", "border-risk-high", "border-risk-critical"];
const airLabels = ["map.pmGood", "map.pmModerate", "map.pmSensitive", "map.pmUnhealthy"];

export function MapLegend({ seismic, air, genplan, building, newBuilding, stationCount, sparse, riskCounts }: {
  seismic: boolean;
  air: boolean;
  genplan: boolean;
  building: boolean;
  newBuilding: boolean;
  stationCount: number;
  sparse: boolean;
  riskCounts: Record<string, number>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="absolute bottom-10 left-2 z-10 max-w-[calc(100%-76px)] rounded-xl border bg-card text-card-foreground shadow-lg sm:left-3 sm:w-72">
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="map-legend-content"
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-muted">
        <Info className="h-4 w-4" />{t("map.legendTitle")}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div id="map-legend-content" className="max-h-[32dvh] space-y-3 overflow-y-auto border-t p-3 text-xs leading-relaxed sm:max-h-[42dvh]">
        <details className="sm:hidden border-b pb-2">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold">
            <Info className="h-4 w-4" />{t("map.featuresHelp")}
          </summary>
          <p className="my-2">{t("map.layerFilterHint")}</p>
          <dl className="space-y-3 pb-2">
            {(Object.keys(mapFeatures) as MapFeature[]).map((feature) => {
              const { icon: Icon, label, hint, className } = mapFeatures[feature];
              return <div key={feature}>
                <dt className={`flex items-center gap-2 font-semibold ${className}`}><Icon className="h-4 w-4" />{t(label)}</dt>
                <dd className="mt-1 text-muted-foreground">{t(hint, { year: newBuildingSince() })}</dd>
              </div>;
            })}
          </dl>
        </details>
        <div className="space-y-2">
          <p className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground" />{t("map.markerComplex")}</p>
          <p className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground ring-2 ring-construction" />{t("map.markerUnderConstruction")}</p>
          <p className="flex items-start gap-2 font-medium text-problematic"><span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-problematic-marker ring-2 ring-problematic-ring" />{t("map.problematicBadge")}</p>
        </div>
        {seismic && <section className="space-y-1.5 border-t pt-3">
          <h3 className="flex items-center gap-2 font-semibold text-feature-seismic"><Activity className="h-4 w-4" />{t("map.legend")}</h3>
          {riskLevels.map((level, index) => <p key={level} className="flex items-center gap-2"><span className={`h-3 w-3 shrink-0 rounded-full ${riskDots[index]}`} />{t(riskLabels[index])}<span className="ml-auto tabular-nums text-muted-foreground">{riskCounts[level] || 0}</span></p>)}
          <p className="flex items-center gap-2 text-muted-foreground"><span className="h-px w-3 bg-risk-critical" />{t("map.faultLabel")}</p>
        </section>}
        {(building || newBuilding) && <section className="space-y-2 border-t pt-3">
          {building && <p className="flex items-center gap-2 text-feature-building"><Construction className="h-4 w-4" />{t("map.featureBuilding")}</p>}
          {newBuilding && <p className="flex items-center gap-2 text-feature-new"><House className="h-4 w-4" />{t("map.featureNew")}</p>}
          <p className="text-muted-foreground">{t("map.stagesLegendHint")}</p>
        </section>}
        {air && <section className="space-y-1.5 border-t pt-3">
          <h3 className="flex items-center gap-2 font-semibold text-feature-air"><Wind className="h-4 w-4" />{t("map.pmTitle")}</h3>
          <p className="text-muted-foreground">{t("map.markerStation")} · {t("map.pmStations", { count: stationCount })}</p>
          {sparse && <p className="text-muted-foreground">{t("map.pmSparse")}</p>}
          {airLabels.map((label, index) => <p key={label} className="flex items-center gap-2"><span className={`h-3 w-3 shrink-0 rounded-full border-2 ${airRings[index]}`} />{t(label)}</p>)}
        </section>}
        {genplan && <section className="space-y-1.5 border-t pt-3">
          <h3 className="flex items-center gap-2 font-semibold text-feature-genplan"><LandPlot className="h-4 w-4" />{t("map.genplanDetailed")}</h3>
          <p className="text-muted-foreground">{t("map.genplanDetailedCredit")}</p>
        </section>}
      </div>}
    </div>
  );
}
