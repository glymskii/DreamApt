"use client";

import Link from "next/link";
import { useGlobalMapData } from "@/hooks/useGlobalComplexes";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Calendar, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Public page surfacing the Almaty 2040 master-plan street-widening
 * timeline. Data baked into the shared package (sourced from Tengrinews'
 * summary of НИИ Алматыгенплан's plan) and shipped over the existing
 * /complexes/map-data response, so this page costs zero extra fetches.
 *
 * Geometry isn't bundled yet — this MVP is a structured text timeline
 * grouped by 5-year completion waves through 2040. Adding precise OSM-
 * traced line segments is a follow-up that needs ~40 manual lookups.
 */
export default function UrbanPlansPage() {
  const { t } = useTranslation();
  const { data: mapData, isLoading } = useGlobalMapData();
  const plans = mapData?.urbanPlans;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">{t("urbanPlans.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("urbanPlans.subtitle")}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : !plans ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {t("urbanPlans.noData")}
          </div>
        ) : (
          <>
            {/* Source citation — gives users a way to verify the data
                and a path to the official authority for clarification. */}
            <div className="mb-5 p-3 rounded-lg border bg-muted/30 text-xs">
              <p className="text-muted-foreground">
                {t("urbanPlans.sourceLabel")}:{" "}
                <a
                  href={plans.source.primaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  {plans.source.primary}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <p className="text-muted-foreground mt-1">
                {t("urbanPlans.authorityLabel")}:{" "}
                <a
                  href={plans.source.authorityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  {plans.source.officialAuthority}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <p className="text-muted-foreground mt-1">
                <a
                  href={plans.source.fullMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  {t("urbanPlans.fullMapLink")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="space-y-5">
              {plans.phases.map((phase) => (
                <section key={phase.year} className="rounded-lg border">
                  <header
                    className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${phaseAccent(phase.year)}`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className="font-semibold">{phase.label}</span>
                    </div>
                    <span className="text-2xl font-bold tabular-nums">{phase.year}</span>
                  </header>
                  <ul className="divide-y">
                    {phase.streets.map((s, i) => (
                      <li key={i} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.segment} · <span className="opacity-70">{s.zone}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Defensive disclaimer — these are planning documents, not
                guaranteed timelines. Same defensive framing as the seismic
                / air-quality blocks. */}
            <p className="text-[11px] text-muted-foreground/80 mt-6 leading-snug">
              {t("urbanPlans.disclaimer")}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/** Colour band per phase year — earlier waves use warmer colours
 *  (closer to action) and later waves cool down. */
function phaseAccent(year: number): string {
  if (year <= 2025) return "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200";
  if (year <= 2030) return "bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
  if (year <= 2035) return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "bg-slate-50 text-slate-900 dark:bg-slate-950/40 dark:text-slate-200";
}
