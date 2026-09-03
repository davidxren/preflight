/**
 * Benjamini–Hochberg control of the false-discovery rate (v1.1 D2). Ten
 * statistics are computed per ticker — five detectors at two horizons — so
 * reading any one of them at a nominal 5% invites a false positive by
 * construction. The adjustment is disclosed on the report rather than applied
 * silently.
 */

/** Owner default: the false-discovery rate the ten statistics are held to. */
export const FALSE_DISCOVERY_RATE = 0.05;

export interface FdrResult {
  /** Indices of `pValues` that survive the adjustment, ascending. */
  rejected: number[];
  /** How many statistics were tested; the "10" the disclosure names. */
  tested: number;
}

/**
 * Rejects the largest set whose p-values satisfy p(k) <= (k/m)·q. A null
 * p-value is a statistic that could not be computed; it is counted as tested
 * and never rejected, so an uncomputable interval cannot inflate the count.
 */
export function benjaminiHochberg(
  pValues: readonly (number | null)[],
  rate: number = FALSE_DISCOVERY_RATE,
): FdrResult {
  const tested = pValues.length;
  const usable = pValues
    .map((p, index) => ({ p, index }))
    .filter((entry): entry is { p: number; index: number } => entry.p !== null)
    .sort((a, b) => a.p - b.p);

  let largestRank = 0;
  for (let rank = 1; rank <= usable.length; rank += 1) {
    if (usable[rank - 1].p <= (rank / tested) * rate) largestRank = rank;
  }

  return {
    rejected: usable
      .slice(0, largestRank)
      .map((entry) => entry.index)
      .sort((a, b) => a - b),
    tested,
  };
}

/**
 * The one sentence check 5 renders. It describes the sample that was measured
 * and says nothing about what follows next (CLAUDE.md §2.2).
 */
export function multiplicitySentence(tested: number, rejected: number): string {
  return (
    `After adjusting for the ${tested} pattern statistics computed for this ` +
    `ticker, ${rejected} differ detectably from the unconditional median`
  );
}
