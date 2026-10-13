"use client";

import { useMemo, useState } from "react";
import type { MapData } from "@/hooks/useComplexes";
import { matchesSearch } from "@/lib/transliterate";
import { isUnderConstruction } from "@/lib/construction";

export type MapComplex = MapData["complexes"][number];

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Search and filters of the public map. One instance per page, shared by
 * the sidebar list (desktop and mobile) and the map markers, so both
 * always show the same ЖК.
 */
export function useComplexFilters(complexes: MapComplex[]) {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [risks, setRisks] = useState<string[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [onlyUnderConstruction, setOnlyUnderConstruction] = useState(false);

  const underConstructionCount = useMemo(
    () => complexes.filter(isUnderConstruction).length,
    [complexes],
  );

  const filtered = useMemo(() => {
    let result = complexes;
    if (search) {
      result = result.filter(
        (c) => matchesSearch(c.displayName, search) || matchesSearch(c.district || "", search),
      );
    }
    if (district) {
      result = result.filter((c) => (c.district || "").includes(district));
    }
    if (risks.length > 0) {
      result = result.filter((c) => risks.includes(c.seismicRiskLevel || "safe"));
    }
    if (floors.length > 0) {
      result = result.filter((c) => c.floorSegment && floors.includes(c.floorSegment));
    }
    if (onlyUnderConstruction) {
      result = result.filter(isUnderConstruction);
    }
    // Copy before sorting: `complexes` is the react-query cache.
    return [...result].sort((a, b) => (Number(b.scoreTotal) || 0) - (Number(a.scoreTotal) || 0));
  }, [complexes, search, district, risks, floors, onlyUnderConstruction]);

  const activeFilters =
    (district ? 1 : 0) + risks.length + floors.length + (onlyUnderConstruction ? 1 : 0);

  // ЖК the map should draw; null while nothing narrows the list.
  const visibleIds = useMemo(
    () => (search || activeFilters > 0 ? new Set(filtered.map((c) => c.id)) : null),
    [filtered, search, activeFilters],
  );

  return {
    search,
    setSearch,
    district,
    setDistrict,
    risks,
    toggleRisk: (risk: string) => setRisks((prev) => toggled(prev, risk)),
    floors,
    toggleFloor: (floor: string) => setFloors((prev) => toggled(prev, floor)),
    onlyUnderConstruction,
    setOnlyUnderConstruction,
    underConstructionCount,
    filtered,
    activeFilters,
    visibleIds,
  };
}

export type ComplexFilters = ReturnType<typeof useComplexFilters>;
