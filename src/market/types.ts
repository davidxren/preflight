/**
 * The single shape every data source produces. The engine reads only this, so
 * sample fixtures and live responses are indistinguishable downstream.
 */

/** One daily OHLC bar. Dates are calendar dates, `YYYY-MM-DD`. */
export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** One side of an option pair at a given strike. */
export interface OptionQuote {
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
}

/** The at-the-money call/put pair for one expiry. */
export interface OptionExpirySnapshot {
  expiry: string;
  atmStrike: number;
  call: OptionQuote;
  put: OptionQuote;
}

/**
 * Reasons a field could not be filled, keyed by the snapshot field name. The
 * engine renders `Data unavailable` plus the reason rather than substituting a
 * value of its own (CLAUDE.md §2.1).
 */
export type UnavailableReasons = Partial<
  Record<
    "spot" | "bars" | "expiries" | "nextEarningsDate" | "dayGainers",
    string
  >
>;

export interface MarketSnapshot {
  symbol: string;
  /** Where the numbers came from; surfaced to the user on every report. */
  source: "sample" | "live";
  /** Human-readable origin of the numbers, shown on every report. */
  provenance: string;
  /** ISO timestamp the snapshot was captured. */
  capturedAt: string;
  /** Last completed trading date the snapshot describes, `YYYY-MM-DD`. */
  asOf: string | null;
  spot: number | null;
  /** "EQUITY", "ETF", "INDEX", …; an ETF has no scheduled earnings at all. */
  instrumentType: string | null;
  /** ~10y of daily bars, ascending by date. */
  bars: DailyBar[];
  /** Nearest expiries, ascending; the engine uses the first that is usable. */
  expiries: OptionExpirySnapshot[];
  nextEarningsDate: string | null;
  /** Yahoo flags estimated earnings dates; the report says so when true. */
  earningsDateIsEstimate: boolean;
  /** Symbols on the day-gainers screen, or null when the screen is unreachable. */
  dayGainers: string[] | null;
  unavailable: UnavailableReasons;
}
