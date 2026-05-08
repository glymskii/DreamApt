"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
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
} from "lucide-react";

const STORAGE_KEY = "dreamapt-onboarding-seen-v1";

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

const TOTAL_STEPS = 4;

function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card text-card-foreground rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[92vh]">
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
        <div className="px-6 py-5 overflow-y-auto flex-1">
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
              {/* Visual hint: a tiny 'map' with dots */}
              <div className="flex items-center justify-center gap-1 py-2">
                {[
                  "bg-green-500",
                  "bg-yellow-500",
                  "bg-orange-500",
                  "bg-red-500",
                  "bg-green-500",
                ].map((c, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${c} ring-2 ring-background`}
                  />
                ))}
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
                  <Activity className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <span className="text-sm">{t("onboarding.step3Bullet1")}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <Wind className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
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
            <div className="text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <KeyRound className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("onboarding.step4Title")}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("onboarding.step4Sub")}
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

          <span className="text-[10px] text-muted-foreground">
            {t("onboarding.stepOf", { current: step + 1, total: TOTAL_STEPS })}
          </span>

          <Button size="sm" onClick={next}>
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
      </div>
    </div>
  );
}
