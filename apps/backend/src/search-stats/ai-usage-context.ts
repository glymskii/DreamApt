import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The search run an OpenAI call belongs to. SearchService runs the whole
 * pipeline inside `aiUsageContext.run({ searchRunId }, …)`, so every
 * AIService call made down the line (expanding the params, scoring each
 * property) adds its tokens to that run without the run id being threaded
 * through ScoringService. Calls made outside a run (life scenarios on a
 * property page, a rescore) only land in the hourly totals.
 */
export const aiUsageContext = new AsyncLocalStorage<{ searchRunId: string }>();
