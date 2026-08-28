/**
 * Fixed citations (CLAUDE.md §5). These strings are verbatim and are not to be
 * reworded or re-sourced; a test asserts each one character for character.
 */
export const CITATIONS: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1:
    'de Silva, Smith & So, "Losing is Optional: Retail Option Trading and ' +
    'Expected Announcement Volatility," Review of Finance 30(2), Mar 2026, ' +
    'pp. 489–535, doi:10.1093/rof/rfaf052. "Retail losses of 5-to-9% on ' +
    'average, and 10-to-14% for high expected volatility announcements."',
  2:
    'Bryzgalova, Pavlova & Sikorskaya, "Retail Trading in Options and the ' +
    'Rise of the Big Three Wholesalers," Journal of Finance 78(6), 2023, ' +
    'pp. 3465–3514, doi:10.1111/jofi.13285. "Weekly options average bid-ask ' +
    'spread of 12.6%"; aggregate retail options losses of $2.1 billion, ' +
    "Nov 2019–Jun 2021.",
  3:
    'Barber, Huang, Odean & Schwarz, "Attention-Induced Trading and Returns: ' +
    'Evidence from Robinhood Users," Journal of Finance 77(6), 2022, ' +
    'pp. 3141–3190, doi:10.1111/jofi.13183. "Average 20-day abnormal returns ' +
    'are −4.7% for the top stocks purchased each day."',
  4:
    'Chague, De-Losso & Giovannetti, "Day Trading for a Living?" SSRN ' +
    '3423101, 2020. Of 1,551 who persisted 300+ days, "97% of them lost ' +
    'money, only 0.4% earned more than a bank teller."',
} as const;

/**
 * Checks 5 and 6 report the ticker's own history and a published government
 * calendar, so neither carries one of the four fixed citations. Their sources
 * are named inline instead.
 */
export const PATTERN_SOURCE_NOTE: string =
  "Base rates are computed from this ticker's own daily closes in the loaded " +
  "price history. No external study is cited for this check.";
