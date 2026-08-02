import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { AirKazService } from "./airkaz.service";
import { AirQualityReadingEntity } from "../database/entities/air-quality-reading.entity";

/**
 * Periodic snapshot of all AirKaz/api.air.org.kz station readings into our
 * own DB. Without this the service shows whatever AirKaz happened to return
 * in our last cache fill, which can be hours stale.
 *
 * Cadence: every 30 min — matches the upstream's hourly granularity with
 * one extra sample inside each hour, enough to catch sharp swings without
 * hammering the public API. Each cycle adds ~400 rows; at 48 cycles/day we
 * grow ~19k rows/day = ~7M/year. The (recordedAt, stationId) compound
 * index keeps time-window queries cheap.
 *
 * Retention: 90 days of detailed data — beyond that we should pre-aggregate
 * into hourly/daily averages and prune. For now we keep raw rows; the
 * pruneOldReadings cron at 3:30 AM enforces the cap.
 */
@Injectable()
export class AirQualityRecorderService implements OnModuleInit {
  private readonly logger = new Logger(AirQualityRecorderService.name);
  private readonly retentionDays = parseInt(
    process.env.AIR_RETENTION_DAYS || "90",
    10,
  );

  constructor(
    private airKaz: AirKazService,
    @InjectRepository(AirQualityReadingEntity)
    private readingsRepo: Repository<AirQualityReadingEntity>,
  ) {}

  /**
   * Take one snapshot immediately on boot so the table isn't empty until
   * the first scheduled cron fires. Runs in the background so it doesn't
   * block startup if the upstream is slow.
   */
  async onModuleInit() {
    this.recordSnapshot().catch((err) =>
      this.logger.warn(`Initial AirKaz snapshot failed: ${err}`),
    );
  }

  /** Every 30 minutes at :00 and :30. */
  @Cron("0,30 * * * *")
  async scheduledSnapshot() {
    await this.recordSnapshot();
  }

  /**
   * Daily at 3:30 AM Almaty time — prune readings older than retention.
   *
   * Outage guard: if the upstream is down we stop ingesting, but this cron
   * would keep deleting — silently eroding the archive until it's empty
   * (exactly what happened when api.air.org.kz went dark). So we only
   * prune when the archive is actually still being fed: the newest row
   * must be fresher than the retention window. Otherwise the whole table
   * is "old" and pruning would wipe irreplaceable history that no upstream
   * can ever backfill.
   */
  @Cron("30 3 * * *")
  async pruneOldReadings() {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const newest = await this.readingsRepo.findOne({
      where: {},
      order: { recordedAt: "DESC" },
      select: ["id", "recordedAt"],
    });
    if (!newest) {
      this.logger.log("AQ prune skipped — archive is empty");
      return;
    }
    if (new Date(newest.recordedAt).getTime() <= cutoff.getTime()) {
      this.logger.warn(
        `AQ prune SKIPPED — newest reading (${new Date(newest.recordedAt).toISOString()}) ` +
          `is already older than the ${this.retentionDays}d window. Ingestion is broken; ` +
          `pruning now would destroy the entire archive.`,
      );
      return;
    }

    const result = await this.readingsRepo.delete({
      recordedAt: LessThan(cutoff),
    });
    this.logger.log(
      `Pruned ${result.affected ?? 0} AQ readings older than ${this.retentionDays}d`,
    );
  }

  /**
   * Fetch fresh data from AirKaz and bulk-insert one row per station.
   * `forceRefresh` bypasses the AirKazService's 15-min in-memory cache so
   * each cron tick really does pull from upstream.
   */
  async recordSnapshot(): Promise<{ inserted: number; skipped: number }> {
    // allowArchiveFallback:false — the service can replay archived rows to
    // keep the map alive during an outage, but writing those back in would
    // duplicate history and fabricate readings that never happened.
    const { stations, source, stale } = await this.airKaz.getStationsDetailed({
      forceRefresh: true,
      allowArchiveFallback: false,
    });
    if (stations.length === 0) {
      this.logger.warn("All AQ upstreams returned 0 stations — snapshot skipped");
      return { inserted: 0, skipped: 0 };
    }
    if (stale) {
      this.logger.warn(`AQ snapshot skipped — data is stale (source ${source})`);
      return { inserted: 0, skipped: 0 };
    }

    let inserted = 0;
    let skipped = 0;
    const rows: Partial<AirQualityReadingEntity>[] = [];

    for (const s of stations) {
      // Skip stations with no useful payload — keep the table noise-free.
      if (s.pm25 === null && !s.date) {
        skipped++;
        continue;
      }
      rows.push({
        stationId: String(s.id),
        name: s.name || `Station ${s.id}`,
        lat: s.lat as any,
        lng: s.lng as any,
        pm25: s.pm25 as any,
        origin: s.origin || undefined,
        district: s.district || undefined,
        recordedAt: s.date ? new Date(s.date) : new Date(),
      });
    }

    if (rows.length > 0) {
      // Single INSERT — at ~400 rows it's faster than a save loop and
      // doesn't fragment the connection pool.
      const result = await this.readingsRepo
        .createQueryBuilder()
        .insert()
        .into(AirQualityReadingEntity)
        .values(rows)
        .execute();
      inserted = result.identifiers.length;
    }

    this.logger.log(
      `AQ snapshot [${source}]: ${inserted} inserted, ${skipped} skipped`,
    );
    return { inserted, skipped };
  }
}
