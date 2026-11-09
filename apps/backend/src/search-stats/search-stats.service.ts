import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThanOrEqual, Repository } from "typeorm";
import {
  SearchRunEntity,
  SearchRunStatus,
  SearchRunUserType,
} from "../database/entities/search-run.entity";
import { AiPurpose, AiUsageStatEntity } from "../database/entities/ai-usage-stat.entity";
import { aiUsageContext } from "./ai-usage-context";

const HOUR_MS = 60 * 60 * 1000;

const num = (v: unknown): number => Number(v) || 0;

/**
 * How much the search is used and what it costs in OpenAI tokens: one
 * `search_runs` row per launch (tokens of its pipeline added as it runs),
 * plus the hourly `ai_usage_stats` totals of every OpenAI call.
 *
 * Writes from the OpenAI path are best-effort — a failed counter is logged
 * and never fails the search.
 */
@Injectable()
export class SearchStatsService {
  private readonly logger = new Logger(SearchStatsService.name);

  constructor(
    @InjectRepository(SearchRunEntity)
    private runsRepo: Repository<SearchRunEntity>,
    @InjectRepository(AiUsageStatEntity)
    private usageRepo: Repository<AiUsageStatEntity>,
  ) {}

  async startRun(input: {
    projectId: string;
    userId: string | null;
    guestId: string | null;
    userType: SearchRunUserType;
    ipHash: string | null;
  }): Promise<string> {
    const run = await this.runsRepo.save(this.runsRepo.create({ ...input, status: "running" }));
    return run.id;
  }

  async finishRun(id: string, status: Exclude<SearchRunStatus, "running">, propertyCount: number) {
    await this.runsRepo.update(id, { status, propertyCount, finishedAt: new Date() });
  }

  /** Searches launched since `since` by this account, or by guests from
   *  this address — what the daily limit counts. */
  async countRunsSince(who: { userId: string } | { ipHash: string }, since: Date): Promise<number> {
    const where =
      "userId" in who
        ? { userId: who.userId, startedAt: MoreThanOrEqual(since) }
        : { ipHash: who.ipHash, userType: "guest" as const, startedAt: MoreThanOrEqual(since) };
    return this.runsRepo.count({ where });
  }

  /** One OpenAI call's tokens: into the hour's totals, and into the search
   *  run the call was made for, if any. */
  async recordAiUsage(
    purpose: AiPurpose,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    const searchRunId = aiUsageContext.getStore()?.searchRunId;
    try {
      await this.usageRepo.query(
        `INSERT INTO ai_usage_stats (hour_bucket, purpose, model, calls, prompt_tokens, completion_tokens, updated_at)
         VALUES ($1, $2, $3, 1, $4, $5, NOW())
         ON CONFLICT (hour_bucket, purpose, model) DO UPDATE SET
           calls = ai_usage_stats.calls + 1,
           prompt_tokens = ai_usage_stats.prompt_tokens + EXCLUDED.prompt_tokens,
           completion_tokens = ai_usage_stats.completion_tokens + EXCLUDED.completion_tokens,
           updated_at = NOW()`,
        [floorToHour(new Date()), purpose, model.slice(0, 60), promptTokens, completionTokens],
      );
      if (searchRunId) {
        await this.runsRepo.query(
          `UPDATE search_runs SET
             ai_calls = ai_calls + 1,
             prompt_tokens = prompt_tokens + $2,
             completion_tokens = completion_tokens + $3
           WHERE id = $1`,
          [searchRunId, promptTokens, completionTokens],
        );
      }
    } catch (err) {
      this.logger.warn(`AI usage not recorded: ${err}`);
    }
  }

  /** Admin analytics for the last `hours`. */
  async summary(hours: number) {
    const since = new Date(Date.now() - hours * HOUR_MS);
    const sinceHour = floorToHour(since);
    const bucket: "hour" | "day" = hours <= 48 ? "hour" : "day";

    const [runs] = await this.runsRepo.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE user_type = 'guest') AS guest,
         COUNT(*) FILTER (WHERE user_type = 'user') AS "user",
         COUNT(*) FILTER (WHERE user_type = 'admin') AS admin,
         COUNT(*) FILTER (WHERE status = 'done') AS done,
         COUNT(*) FILTER (WHERE status = 'empty') AS empty,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE status = 'running') AS running,
         COUNT(DISTINCT COALESCE(user_id::text, guest_id::text, ip_hash)) AS people,
         COALESCE(SUM(ai_calls), 0) AS calls,
         COALESCE(SUM(prompt_tokens), 0) AS prompt,
         COALESCE(SUM(completion_tokens), 0) AS completion
       FROM search_runs WHERE started_at >= $1`,
      [since],
    );

    const purposes: Array<Record<string, string>> = await this.usageRepo.query(
      `SELECT purpose, SUM(calls) AS calls, SUM(prompt_tokens) AS prompt, SUM(completion_tokens) AS completion
       FROM ai_usage_stats WHERE hour_bucket >= $1
       GROUP BY purpose ORDER BY SUM(prompt_tokens + completion_tokens) DESC`,
      [sinceHour],
    );

    const runBuckets: Array<{ bucket: Date; searches: string }> = await this.runsRepo.query(
      `SELECT date_trunc($2, started_at) AS bucket, COUNT(*) AS searches
       FROM search_runs WHERE started_at >= $1 GROUP BY 1`,
      [since, bucket],
    );
    const tokenBuckets: Array<{ bucket: Date; tokens: string }> = await this.usageRepo.query(
      `SELECT date_trunc($2, hour_bucket) AS bucket, SUM(prompt_tokens + completion_tokens) AS tokens
       FROM ai_usage_stats WHERE hour_bucket >= $1 GROUP BY 1`,
      [sinceHour, bucket],
    );
    const timeline = new Map<string, { bucket: string; searches: number; tokens: number }>();
    const slot = (d: Date) => {
      const key = new Date(d).toISOString();
      if (!timeline.has(key)) timeline.set(key, { bucket: key, searches: 0, tokens: 0 });
      return timeline.get(key)!;
    };
    for (const r of runBuckets) slot(r.bucket).searches = num(r.searches);
    for (const r of tokenBuckets) slot(r.bucket).tokens = num(r.tokens);

    const recent: Array<Record<string, any>> = await this.runsRepo.query(
      `SELECT r.id, r.project_id AS "projectId", r.user_type AS "userType", r.status,
              r.property_count AS "propertyCount", r.ai_calls AS "aiCalls",
              r.prompt_tokens AS "promptTokens", r.completion_tokens AS "completionTokens",
              r.started_at AS "startedAt", r.finished_at AS "finishedAt",
              u.display_name AS "displayName", u.username, u.phone
       FROM search_runs r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.started_at >= $1
       ORDER BY r.started_at DESC LIMIT 30`,
      [since],
    );

    const total = num(runs?.total);
    const pipelineTokens = num(runs?.prompt) + num(runs?.completion);
    const byPurpose = purposes.map((p) => ({
      purpose: p.purpose as AiPurpose,
      calls: num(p.calls),
      prompt: num(p.prompt),
      completion: num(p.completion),
      total: num(p.prompt) + num(p.completion),
    }));
    const sum = (key: "calls" | "prompt" | "completion" | "total") =>
      byPurpose.reduce((s, p) => s + p[key], 0);

    return {
      hours,
      bucket,
      searches: {
        total,
        people: num(runs?.people),
        byUserType: { guest: num(runs?.guest), user: num(runs?.user), admin: num(runs?.admin) },
        byStatus: {
          done: num(runs?.done),
          empty: num(runs?.empty),
          failed: num(runs?.failed),
          running: num(runs?.running),
        },
      },
      tokens: {
        // Every OpenAI call in the window, by what it was for.
        calls: sum("calls"),
        prompt: sum("prompt"),
        completion: sum("completion"),
        total: sum("total"),
        byPurpose,
        // The search pipeline's share, counted on the runs themselves.
        searchPipeline: {
          calls: num(runs?.calls),
          total: pipelineTokens,
          perSearch: total > 0 ? Math.round(pipelineTokens / total) : 0,
        },
      },
      timeline: [...timeline.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
      recent: recent.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        userType: r.userType as SearchRunUserType,
        status: r.status as SearchRunStatus,
        propertyCount: num(r.propertyCount),
        aiCalls: num(r.aiCalls),
        tokens: num(r.promptTokens) + num(r.completionTokens),
        startedAt: new Date(r.startedAt).toISOString(),
        finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
        user: r.userType === "guest" ? null : {
          name: r.displayName || r.username || "",
          phone: r.phone || null,
        },
      })),
    };
  }
}

function floorToHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

/** Salted SHA-256 of the client address: enough to count a guest's
 *  searches per address, useless for recovering the address. */
export function hashClientIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const salt = process.env.JWT_SECRET || "dreamapt-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
