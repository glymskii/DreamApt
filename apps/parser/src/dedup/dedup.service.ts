import type { PropertyDetail } from "../scraper/detail-scraper";

interface DedupGroup {
  primary: PropertyDetail;
  duplicates: PropertyDetail[];
  reason: string;
}

export class DedupService {
  private hammingDistance(a: string, b: string): number {
    if (a.length !== b.length) return 64; // max distance
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) dist++;
    }
    return dist;
  }

  dedup(
    properties: PropertyDetail[],
    photoHashes: Map<string, string[]>,
  ): DedupGroup[] {
    const groups: DedupGroup[] = [];
    const used = new Set<string>();

    for (let i = 0; i < properties.length; i++) {
      if (used.has(properties[i].krishaId)) continue;

      const group: DedupGroup = {
        primary: properties[i],
        duplicates: [],
        reason: "",
      };

      for (let j = i + 1; j < properties.length; j++) {
        if (used.has(properties[j].krishaId)) continue;

        // Check composite key: complex + area + phone
        if (
          properties[i].complexName &&
          properties[i].complexName === properties[j].complexName &&
          Math.abs(properties[i].areaTotal - properties[j].areaTotal) < 1 &&
          properties[i].phone &&
          properties[i].phone === properties[j].phone
        ) {
          group.duplicates.push(properties[j]);
          group.reason = "complex_area_phone";
          used.add(properties[j].krishaId);
          continue;
        }

        // Check photo hashes
        const hashesA = photoHashes.get(properties[i].krishaId) || [];
        const hashesB = photoHashes.get(properties[j].krishaId) || [];
        let photoMatch = false;
        for (const ha of hashesA) {
          for (const hb of hashesB) {
            if (this.hammingDistance(ha, hb) < 5) {
              photoMatch = true;
              break;
            }
          }
          if (photoMatch) break;
        }
        if (photoMatch) {
          group.duplicates.push(properties[j]);
          group.reason = "photo_hash";
          used.add(properties[j].krishaId);
        }
      }

      used.add(properties[i].krishaId);
      groups.push(group);
    }

    return groups;
  }
}
