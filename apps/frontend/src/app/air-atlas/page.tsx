"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Maximize2, Wind } from "lucide-react";

/** The research scene: a standalone three.js page with its own data files. */
const AIR_ATLAS_SCENE ="/research/almaty-volume.html";

/**
 * «Атлас воздуха»: the 3D PM 2.5 cloud and wind over Almaty, hour by hour
 * for a typical day of each season and weekday. The scene is static — it
 * lives under public/research and runs on its own — so the app gives it a
 * slim bar back to the map and the rest of the screen.
 */
export default function AirAtlasPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0c1d20]">
      <header className="z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 text-card-foreground sm:px-3">
        <Link href="/dashboard" aria-label={t("common.back")} title={t("common.back")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Wind className="h-4 w-4 shrink-0 text-feature-air" aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-sm font-semibold">{t("airAtlas.title")}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{t("airAtlas.subtitle")}</p>
        </div>
        <a href={AIR_ATLAS_SCENE} title={t("airAtlas.fullscreen")}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-muted">
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("airAtlas.fullscreen")}</span>
        </a>
      </header>
      <iframe src={AIR_ATLAS_SCENE} title={t("airAtlas.frameTitle")} allow="fullscreen"
        className="block min-h-0 w-full flex-1 border-0" />
    </div>
  );
}
