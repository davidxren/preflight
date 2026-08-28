/**
 * Every environment variable Preflight reads, in one place. Sample mode is the
 * default and needs none of them (CLAUDE.md §9).
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** "live" opts into live data; anything else stays in sample mode. */
    PREFLIGHT_DATA?: string;
    /** SQLite file for the cache and waitlist. Defaults to ./preflight.db. */
    PREFLIGHT_DB_PATH?: string;
    /** Overrides the gate G1 reachability probe, for exercising its failure. */
    PREFLIGHT_PROBE_URL?: string;
    /** Options-chain fallback credential (CLAUDE.md §9). */
    TRADIER_SANDBOX_TOKEN?: string;
    /** Earnings-date fallback credential (CLAUDE.md §9). */
    FINNHUB_API_KEY?: string;
    /** Enables the optional explainer (gate G2). Absent is not an error. */
    ANTHROPIC_API_KEY?: string;
  }
}
