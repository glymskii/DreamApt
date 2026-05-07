import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "DreamApt — Умный подбор квартир",
  description: "AI-сервис подбора квартир в Алматы",
};

// Inline script to apply theme before React hydrates — prevents FOUC.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('dreamapt-theme') || 'system';
    var theme = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
