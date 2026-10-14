"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FeaturePanel } from "@/components/map/FeaturePanel";
import type { MapFeature } from "@/components/map/feature-style";
import { useTranslation } from "react-i18next";
import { setStoredLocale, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Map as MapIcon,
  Database,
  KeyRound,
  ChevronRight,
  ChevronLeft,
  Check,
  Activity,
  Wind,
  Star,
  AlertTriangle,
  LandPlot,
  MessageSquare,
  Sparkles,
} from "lucide-react";

// Keep v2: the map-introduction step is revised in place; returning users
// retain their dismissal, including the local screenshot harness.
const STORAGE_KEY = "dreamapt-onboarding-seen-v2";

interface OnboardingContextValue {
  /** Open the dialog manually (e.g. from a "Show again" link). */
  open: () => void;
  /** Close + mark as seen. */
  close: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return ctx;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // Auto-show on first visit
  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setIsOpen(true);
    } catch {
      // ignore
    }
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setIsOpen(false);
  }, []);

  return (
    <OnboardingContext.Provider value={{ open, close }}>
      {children}
      {isOpen && <OnboardingDialog onClose={close} />}
    </OnboardingContext.Provider>
  );
}

const TOTAL_STEPS = 5;

function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [previewFeatures, setPreviewFeatures] = useState<Record<MapFeature, boolean>>({
    seismic: true, air: true, genplan: false, building: false, new: false,
  });

  const next = () => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else onClose();
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const currentLocale = i18n.language as Locale;
  const setLocale = (l: Locale) => setStoredLocale(l);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content aria-describedby={undefined} className="public-map-ui fixed left-1/2 top-1/2 z-[70] flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
          <Dialog.Title className="sr-only">{t(`onboarding.step${step + 1}Title`)}</Dialog.Title>
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                  ? "w-1.5 bg-primary/60"
                  : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-0 px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto flex-1">
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center">
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("onboarding.step1Title")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("onboarding.step1Sub")}
                </p>
              </div>
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t("onboarding.step1Lang")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["ru", "kk"] as const).map((l) => (
                    <button
                      key={l}
                      aria-pressed={currentLocale === l}
                      onClick={() => setLocale(l)}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        currentLocale === l
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      }`}
                    >
                      {currentLocale === l && <Check className="h-3.5 w-3.5" />}
                      {t(`lang.${l}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <MapIcon className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("onboarding.step2Title")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("onboarding.step2Sub")}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border text-left">
                <FeaturePanel preview active={previewFeatures} onToggle={(feature) => setPreviewFeatures((current) => ({ ...current, [feature]: !current[feature] }))} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("map.layerFilterHint")}</p>
              {/* Marker legend — explains the two visual languages on the map.
                  Solid = ЖК with a score color, hollow ring = AirKaz station
                  with a PM2.5 color. Without this users mistake stations for
                  weirdly-styled ЖК markers. */}
              <div className="space-y-2 pt-2 text-left">
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="h-3 w-3 rounded-full bg-risk-safe ring-2 ring-background" />
                    <span className="h-3 w-3 rounded-full bg-risk-moderate ring-2 ring-background -ml-1" />
                    <span className="h-3 w-3 rounded-full bg-risk-critical ring-2 ring-background -ml-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{t("onboarding.legendComplexTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("onboarding.legendComplexSub")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="h-3 w-3 rounded-full bg-background border-2 border-risk-safe" />
                    <span className="h-3 w-3 rounded-full bg-background border-2 border-risk-high -ml-1" />
                    <span className="h-3 w-3 rounded-full bg-background border-2 border-risk-critical -ml-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{t("onboarding.legendStationTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("onboarding.legendStationSub")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Database className="h-7 w-7" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">{t("onboarding.step3Title")}</h2>
              </div>
              <ul className="space-y-2.5 mt-3">
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <Activity className="h-5 w-5 text-feature-seismic shrink-0 mt-0.5" />
                  <span className="text-sm">{t("onboarding.step3Bullet1")}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <Wind className="h-5 w-5 text-feature-air shrink-0 mt-0.5" />
                  <span className="text-sm">{t("onboarding.step3Bullet2")}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <Star className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5 fill-yellow-500" />
                  <span className="text-sm">{t("onboarding.step3Bullet3")}</span>
                </li>
              </ul>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Sparkles className="h-7 w-7" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">{t("onboarding.step4Title")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("onboarding.step4Sub")}
                </p>
              </div>
              {/* Context for warnings, the detailed plan, and public discussion. */}
              <ul className="space-y-2.5 mt-3">
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <AlertTriangle className="h-5 w-5 text-problematic shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t("onboarding.step4Feat1Title")}</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                      {t("onboarding.step4Feat1Sub")}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <LandPlot className="h-5 w-5 text-feature-genplan shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t("onboarding.step4Feat2Title")}</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                      {t("onboarding.step4Feat2Sub")}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t("onboarding.step4Feat3Title")}</p>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                      {t("onboarding.step4Feat3Sub")}
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <KeyRound className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("onboarding.step5Title")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("onboarding.step5Sub")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: prev/next + skip */}
        <div className="border-t p-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={step === 0 ? onClose : prev}
            disabled={false}
          >
            {step === 0 ? (
              <>{t("common.skip")}</>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("common.back")}
              </>
            )}
          </Button>

          <span className="text-xs text-muted-foreground">
            {t("onboarding.stepOf", { current: step + 1, total: TOTAL_STEPS })}
          </span>

          <Button size="sm" className="min-h-11" onClick={next}>
            {step === TOTAL_STEPS - 1 ? (
              <>
                {t("onboarding.start")}
                <Check className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                {t("common.next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
