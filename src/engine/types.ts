import type { MarketSnapshot } from "@/market/types";

/** The only actions Preflight accepts. */
export const TRADE_ACTIONS = ["buy shares", "buy call", "buy put"] as const;
export type TradeAction = (typeof TRADE_ACTIONS)[number];

export function isTradeAction(value: string): value is TradeAction {
  return (TRADE_ACTIONS as readonly string[]).includes(value);
}

/**
 * One labelled figure. `value` is always display-ready text; `numeric` carries
 * the underlying number so the explainer's number guard can check the model's
 * prose against what the engine actually computed (CLAUDE.md §2.4).
 */
export interface Figure {
  label: string;
  value: string;
  numeric?: number;
  /** Present only when `value` is `Data unavailable`. */
  reason?: string;
}

export interface CheckResult {
  /** 1-6, matching the fixed six checks. */
  number: number;
  title: string;
  /** Impersonal statement of the situation. Never a verdict (CLAUDE.md §2.2). */
  summary: string;
  figures: Figure[];
  /** Impersonal supporting lines: method, warnings, assumptions. */
  notes: string[];
  citation: string;
}

/** Hypothetical sizing numbers. Never persisted (CLAUDE.md §2.3). */
export interface SizingInputs {
  /** Account equity. */
  equity: number;
  /** Fraction of equity risked per trade. */
  riskFraction: number;
  /** Win probability, 0-1. */
  winProbability: number;
  /** Payoff ratio: average win divided by average loss. */
  payoffRatio: number;
  /** Fraction of equity the ruin threshold sits below. */
  riskBudgetFraction: number;
}

export interface Explanation {
  text: string;
  origin: "template" | "model";
  /** Why the model output was not used, when it was requested but rejected. */
  fallbackReason?: string;
}

export interface Report {
  symbol: string;
  action: TradeAction;
  /** Calendar date the report was built for, `YYYY-MM-DD`. */
  today: string;
  /** Last completed trading date the market data describes. */
  asOf: string | null;
  source: MarketSnapshot["source"];
  provenance: string;
  checks: CheckResult[];
  disclaimer: string;
  explanation: Explanation;
}
