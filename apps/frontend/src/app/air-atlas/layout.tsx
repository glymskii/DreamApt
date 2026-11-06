import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Атлас воздуха — DreamApt",
  description: "Облако PM2.5 и ветер над Алматы в 3D: типичные сутки по сезонам и дням недели.",
};

export default function AirAtlasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
