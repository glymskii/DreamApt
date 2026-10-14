import { Activity, Wind, Construction, House, LandPlot } from "lucide-react";

/** Shared identity for the toolbar, onboarding, legend, list and detail card. */
export const mapFeatures = {
  seismic: { icon: Activity, label: "map.featureSeismic", hint: "map.featureSeismicHint", className: "text-feature-seismic" },
  air: { icon: Wind, label: "map.featureAir", hint: "map.featureAirHint", className: "text-feature-air" },
  building: { icon: Construction, label: "map.featureBuilding", hint: "map.featureBuildingHint", className: "text-feature-building" },
  new: { icon: House, label: "map.featureNew", hint: "map.featureNewHint", className: "text-feature-new" },
  genplan: { icon: LandPlot, label: "map.featureGenplan", hint: "map.featureGenplanHint", className: "text-feature-genplan" },
} as const;

export type MapFeature = keyof typeof mapFeatures;

/** MapLibre needs literal colours, so resolve the CSS tokens at style load. */
export function readMapColor(token: string): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  return `rgb(${channels.split(/\s+/).join(",")})`;
}

// Lucide geometry (ISC), matching the React icons above. Static SVG nodes let
// MapLibre popups share the icons without an HTML sink or extra React roots.
const popupIcons: Record<"building" | "new" | "seismic" | "air" | "problematic" | "comment", [string, Record<string, string>][]> = {
  building: [
    ["rect", { x: "2", y: "6", width: "20", height: "8", rx: "1" }],
    ["path", { d: "M17 14v7" }],
    ["path", { d: "M7 14v7" }],
    ["path", { d: "M17 3v3" }],
    ["path", { d: "M7 3v3" }],
    ["path", { d: "M10 14 2.3 6.3" }],
    ["path", { d: "m14 6 7.7 7.7" }],
    ["path", { d: "m8 6 8 8" }]
  ],
  new: [
    ["path", { d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" }],
    [
      "path",
      {
        d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
      }
  ]
  ],
  seismic: [
    [
      "path",
      {
        d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
      }
  ]
  ],
  air: [
    ["path", { d: "M12.8 19.6A2 2 0 1 0 14 16H2" }],
    ["path", { d: "M17.5 8a2.5 2.5 0 1 1 2 4H2" }],
    ["path", { d: "M9.8 4.4A2 2 0 1 1 11 8H2" }]
  ],
  problematic: [
    [
      "path",
      {
        d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      }
  ],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }]
  ],
  comment: [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      }
  ]
  ],
};

export function popupIcon(feature: keyof typeof popupIcons): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
    svg.setAttribute(name, value);
  }
  svg.style.flexShrink = "0";
  svg.style.color = feature === "problematic" ? "rgb(var(--problematic))" : feature === "comment" ? "currentColor" : `rgb(var(--feature-${feature}))`;
  for (const [tag, attributes] of popupIcons[feature]) {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    svg.appendChild(node);
  }
  return svg;
}
