import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import {
  AKIMAT_PROBLEMATIC_2025_07_12,
  AkimatProblematicItem,
  AkimatProblematicSnapshot,
} from "./akimat-list-2025-07-12";

export interface SyncReport {
  total: number;
  matched: number;
  alreadyFlagged: number;
  stubsCreated: number;
  failures: Array<{ name: string; reason: string }>;
  matches: Array<{
    source: string;
    matchedTo: string | null;
    matchType: "exact" | "fuzzy" | "stub";
    complexId: string;
  }>;
}

export interface ProblematicDTO {
  id: string;
  name: string;
  displayName: string | null;
  address: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  isStub: boolean;
  problematicSourceName: string | null;
  problematicAddress: string | null;
  problematicReason: string | null;
  problematicSourceUrl: string | null;
  problematicUpdatedAt: string | null;
}

const FUZZY_MAX_DISTANCE = 2;
const ALMATY_BOUNDS = { minLat: 43.0, maxLat: 43.5, minLng: 76.4, maxLng: 77.5 };

/**
 * Owns the per-complex "problematic" flag. Two data flows feed it:
 *
 *  1. Akimat-list sync — runs on admin click. Walks the snapshot from
 *     akimat-list-YYYY-MM-DD.ts, tries to fuzzy-match each entry to an
 *     existing ResidentialComplex by normalised name; for misses we
 *     geocode the address via 2GIS and create a "stub" complex (no
 *     Krisha data, just the warning) so the marker still appears on
 *     the public map. Re-running is safe — already-flagged rows are
 *     skipped.
 *
 *  2. Manual admin entry — same writer path, just one entry at a time.
 *
 * Unflagging differs by row type:
 *   - matched real complex → just clear the 5 problematic_* columns
 *   - stub                  → delete the row entirely (it only exists
 *                             because we wanted the marker; admin
 *                             saying "this is wrong" means delete)
 */
@Injectable()
export class ProblematicComplexesService {
  private readonly logger = new Logger(ProblematicComplexesService.name);

  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
  ) {}

  /** Bulk sync from the bundled akimat snapshot. */
  async syncFromAkimatList(): Promise<SyncReport> {
    return this.runSync(AKIMAT_PROBLEMATIC_2025_07_12);
  }

  /** List all currently-flagged complexes (matched + stubs). Admin UI. */
  async listFlagged(): Promise<ProblematicDTO[]> {
    const rows = await this.complexesRepo.find({
      where: { isProblematic: true },
      order: { problematicUpdatedAt: "DESC" },
    });
    return rows.map(toDTO);
  }

  /**
   * Clear the flag. For stubs we delete the row outright — they only
   * exist because of the flag, no reason to keep an orphan. For matched
   * real complexes we keep the row and just null out the problematic_*
   * columns.
   */
  async unflag(complexId: string): Promise<{ deleted: boolean }> {
    const c = await this.complexesRepo.findOne({ where: { id: complexId } });
    if (!c) throw new NotFoundException("Complex not found");
    if (!c.isProblematic) {
      throw new BadRequestException("Complex is not flagged");
    }
    if (c.isStub) {
      await this.complexesRepo.delete(c.id);
      return { deleted: true };
    }
    await this.complexesRepo.update(c.id, {
      isProblematic: false,
      problematicSourceName: null,
      problematicAddress: null,
      problematicReason: null,
      problematicSourceUrl: null,
      problematicUpdatedAt: null,
    });
    return { deleted: false };
  }

  /**
   * Admin manually adds a single entry. Same matching pipeline as the
   * bulk sync but always wraps a single item; useful for inter-release
   * updates from the akimat WhatsApp channel.
   */
  async addManualEntry(input: {
    name: string;
    district?: string;
    address?: string;
    reason?: string;
    sourceUrl?: string;
  }): Promise<ProblematicDTO> {
    const item: AkimatProblematicItem = {
      name: (input.name || "").trim(),
      district: (input.district || "").trim(),
      address: (input.address || "").trim(),
    };
    if (!item.name) throw new BadRequestException("Name is required");

    const snapshot: AkimatProblematicSnapshot = {
      publishedAt: new Date().toISOString().slice(0, 10),
      sourceUrl: (input.sourceUrl || "").trim() || "manual",
      reasonGeneric:
        (input.reason || "").trim() ||
        "Внесено администратором вручную (источник: WhatsApp-канал УГАСК или иная официальная коммуникация).",
      items: [item],
    };
    const report = await this.runSync(snapshot);
    const matchedId = report.matches[0]?.complexId;
    if (!matchedId) {
      throw new BadRequestException(
        report.failures[0]?.reason || "Не удалось добавить запись",
      );
    }
    const row = await this.complexesRepo.findOne({ where: { id: matchedId } });
    return toDTO(row!);
  }

  // ── internals ──────────────────────────────────────────────────────

  private async runSync(snapshot: AkimatProblematicSnapshot): Promise<SyncReport> {
    const report: SyncReport = {
      total: snapshot.items.length,
      matched: 0,
      alreadyFlagged: 0,
      stubsCreated: 0,
      failures: [],
      matches: [],
    };
    const publishedAt = new Date(snapshot.publishedAt);

    // Load all existing complexes once — we only have ~500 globally, so
    // a single in-memory pass beats one DB query per item.
    const allExisting = await this.complexesRepo.find();
    const byNorm = new Map<string, ResidentialComplexEntity>();
    for (const c of allExisting) {
      const keys = [c.name, c.displayName].filter(Boolean) as string[];
      for (const k of keys) {
        const norm = normalize(k);
        if (norm && !byNorm.has(norm)) byNorm.set(norm, c);
      }
    }

    for (const item of snapshot.items) {
      try {
        const result = await this.applyOne(item, byNorm, snapshot, publishedAt);
        report.matches.push({
          source: item.name,
          matchedTo: result.complex.displayName || result.complex.name,
          matchType: result.matchType,
          complexId: result.complex.id,
        });
        if (result.matchType === "stub") report.stubsCreated++;
        else if (result.wasAlreadyFlagged) report.alreadyFlagged++;
        else report.matched++;
      } catch (err: any) {
        this.logger.warn(`Failed to flag "${item.name}": ${err.message}`);
        report.failures.push({ name: item.name, reason: err.message });
      }
    }

    this.logger.log(
      `Akimat sync: ${report.matched} flagged, ${report.alreadyFlagged} already, ${report.stubsCreated} stubs, ${report.failures.length} failed`,
    );
    return report;
  }

  private async applyOne(
    item: AkimatProblematicItem,
    byNorm: Map<string, ResidentialComplexEntity>,
    snapshot: AkimatProblematicSnapshot,
    publishedAt: Date,
  ): Promise<{
    complex: ResidentialComplexEntity;
    matchType: "exact" | "fuzzy" | "stub";
    wasAlreadyFlagged: boolean;
  }> {
    const norm = normalize(item.name);
    if (!norm) throw new Error("Empty normalized name");

    // 1) Exact normalized match
    let hit = byNorm.get(norm);
    let matchType: "exact" | "fuzzy" | "stub" = "exact";

    // 2) Fuzzy (Levenshtein ≤ 2) only if exact missed
    if (!hit) {
      for (const [key, candidate] of byNorm) {
        if (Math.abs(key.length - norm.length) > 3) continue;
        if (levenshtein(key, norm) <= FUZZY_MAX_DISTANCE) {
          hit = candidate;
          matchType = "fuzzy";
          break;
        }
      }
    }

    if (hit) {
      const wasAlreadyFlagged = hit.isProblematic;
      // Re-apply metadata even on idempotent re-sync so admin sees the
      // latest source URL / publishedAt in the panel.
      await this.complexesRepo.update(hit.id, {
        isProblematic: true,
        problematicSourceName: item.name,
        problematicAddress: item.address || null,
        problematicReason: snapshot.reasonGeneric,
        problematicSourceUrl: snapshot.sourceUrl,
        problematicUpdatedAt: publishedAt,
      });
      const fresh = await this.complexesRepo.findOne({ where: { id: hit.id } });
      return { complex: fresh!, matchType, wasAlreadyFlagged };
    }

    // 3) No name match → create stub. Geocode the address so the marker
    //    can appear on the map; tolerate geocode failure (stub still
    //    exists in the admin list, just without coords).
    const coord = await this.geocodeAddress(item.name, item.address);
    const normalizedName = norm || item.name.toLowerCase();
    const saved = await this.complexesRepo.save({
      name: normalizedName,
      displayName: item.name,
      district: item.district || undefined,
      address: item.address || undefined,
      lat: coord?.lat as any,
      lng: coord?.lng as any,
      groupingMethod: "akimat_problematic_stub",
      isProblematic: true,
      isStub: true,
      problematicSourceName: item.name,
      problematicAddress: item.address || null,
      problematicReason: snapshot.reasonGeneric,
      problematicSourceUrl: snapshot.sourceUrl,
      problematicUpdatedAt: publishedAt,
    } as Partial<ResidentialComplexEntity>);
    // Index the new stub by name so a subsequent dup in the same sync
    // doesn't recreate it.
    byNorm.set(normalizedName, saved);
    return { complex: saved, matchType: "stub", wasAlreadyFlagged: false };
  }

  /**
   * 2GIS catalog geocode biased to Almaty. Returns null on miss; safe
   * for stubs where coords are nice-to-have, not required. Pattern
   * mirrors the helper inside SearchService — kept private here to
   * avoid a cross-module dependency for a 25-line utility.
   */
  private async geocodeAddress(
    name: string,
    address: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const key = process.env.TWOGIS_API_KEY || "rubnkm7490";
    // Compose: "ЖК <name>, Алматы, <address>" — 2GIS gives best hits
    // when given both the named landmark and the street context.
    const q = encodeURIComponent(
      `${name} Алматы ${address}`.replace(/\s+/g, " ").trim(),
    );
    const url = `https://catalog.api.2gis.com/3.0/items?q=${q}&fields=items.point&page_size=1&key=${key}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const pt = json?.result?.items?.[0]?.point;
      if (!pt?.lat || !(pt?.lon || pt?.lng)) return null;
      const lat = Number(pt.lat);
      const lng = Number(pt.lon ?? pt.lng);
      if (
        lat < ALMATY_BOUNDS.minLat ||
        lat > ALMATY_BOUNDS.maxLat ||
        lng < ALMATY_BOUNDS.minLng ||
        lng > ALMATY_BOUNDS.maxLng
      ) {
        return null;
      }
      return { lat, lng };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function toDTO(c: ResidentialComplexEntity): ProblematicDTO {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName || null,
    address: c.address || null,
    district: c.district || null,
    lat: c.lat != null ? Number(c.lat) : null,
    lng: c.lng != null ? Number(c.lng) : null,
    isStub: c.isStub,
    problematicSourceName: c.problematicSourceName,
    problematicAddress: c.problematicAddress,
    problematicReason: c.problematicReason,
    problematicSourceUrl: c.problematicSourceUrl,
    problematicUpdatedAt: c.problematicUpdatedAt
      ? c.problematicUpdatedAt.toISOString()
      : null,
  };
}

// Mirror of the normalisation used in SearchService.normalizeComplexName
// — keep them in sync so a complex grouped by search also matches here.
function normalize(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/["'«»""]/g, "")
    .replace(/\bжк\b/gi, "")
    .replace(/\bж\.к\.\b/gi, "")
    .replace(/\bмжк\b/gi, "")
    .replace(/\bмжд\b/gi, "")
    .replace(/\bклубный дом\b/gi, "")
    .replace(/\bрезиденс\b/gi, "residence")
    .replace(/[^a-zа-яёғқңүұһі0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
