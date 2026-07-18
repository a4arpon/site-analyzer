import type { Priority } from "#src/types.ts"

export const AppConfig = {
  appName: "webalyzer",
  // User-Agent sent on every crawl + fetch. Keep "webalyzer" in sync with repo.
  userAgent: "webalyzer/1.0 (Audit Bot; +https://github.com/a4arpon/webalyzer)",
}

// Engine-wide defaults. engine.ts pulls from here so magic numbers live in one
// place. Tune without touching engine logic.
export const EngineDefaults = {
  fetch: {
    timeoutMs: 15000,
    userAgent: AppConfig.userAgent,
    maxRedirects: 3,
    retries: 1,
    acceptEncoding: "gzip, deflate, br",
    followRedirects: true,
  },
  concurrency: 5,
  cache: true,
  followRedirects: true,
  ruleBatchSize: 10,
  logLevel: "info" as const,
}

// Health-score weighting. Start at 100, subtract per finding, floor at 0.
// P0-heavy so a single critical bug dominates; P2=15 keeps minor agent-
// readiness gaps meaningful (P2=1 would make them near-invisible).
export const ScoreWeights: Record<Priority, number> = {
  P0: 50,
  P1: 30,
  P2: 15,
  P3: 4,
}
