import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBlock } from "../disclaimer-block";
import { Masthead } from "../masthead";
import { MEAN_BLOCK_SESSIONS, RESAMPLES } from "@/engine/block-bootstrap";
import { CITATIONS, PATTERN_SOURCE_NOTE } from "@/engine/citations";
import { FALSE_DISCOVERY_RATE } from "@/engine/false-discovery";
import { MACRO_SOURCE_URLS } from "@/data/macro";
import { PATTERN_DETECTORS } from "@/engine/pattern-detectors";

/**
 * How every figure on the report is computed (v1.1 D3). It restates what the
 * engine already does and makes no claim the report does not: no figure here
 * is new, and nothing here says what any number implies about the future.
 *
 * The detector definitions and the citations are read from the engine rather
 * than retyped, so this page cannot drift from the code it describes.
 */

export const metadata: Metadata = {
  title: "Methodology — Preflight",
  description: "How each of the six checks is computed, and from what data.",
};

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-10 border-t border-rule-strong pt-6">
      <h2 className="text-xs uppercase tracking-widest text-amber">{heading}</h2>
      <div className="mt-3 max-w-prose space-y-3 text-sm leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

export default function Methodology(): React.ReactElement {
  return (
    <>
      <Masthead />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
          Every figure on a report is computed from the data described here. A
          figure that cannot be computed is shown as{" "}
          <span className="figure text-ink">Data unavailable</span> with the
          reason it could not be. Nothing on this page, and nothing on a report,
          says what any number means for what happens next.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">
          <Link href="/" className="text-amber underline underline-offset-2">
            Back to the checks
          </Link>
        </p>

        <Section heading="Where the numbers come from">
          <p>
            Sample mode is the default. It reads snapshots committed to the
            repository for four tickers, captured on the date each report
            states, and it makes no network call at all. Every report names its
            data source and its as-of date, so sample figures are never
            mistaken for live ones.
          </p>
          <p>
            Live mode is opt-in. Each field has a primary source and a
            documented fallback; where both are unreachable the field reports
            that it is unavailable and why, rather than carrying a substituted
            number. Prices are daily bars, roughly ten years of them.
          </p>
        </Section>

        <Section heading="Check 1 — earnings proximity and implied move">
          <p>
            Days to the next scheduled earnings date, in calendar days and in
            trading sessions. The implied move is the at-the-money straddle mid
            at the nearest expiry after the as-of date, divided by the spot
            price. An expiry on the as-of date itself is skipped, because it
            settles that day and no longer prices a forward move. An
            exchange-traded fund has no scheduled announcement, which the report
            states rather than marking unavailable.
          </p>
          <p className="text-ink-faint">{CITATIONS[1]}</p>
        </Section>

        <Section heading="Check 2 — options bid-ask spread drag">
          <p>
            The quoted spread on the contract the intended action implies — the
            call for a call buyer, the put for a put buyer — as (ask − bid) ÷
            mid, in percent, at the nearest usable expiry. A one-sided or
            crossed quote is not priced. Buying shares crosses no option
            spread, so for that action the option figures are shown for
            reference only and labelled as such.
          </p>
          <p className="text-ink-faint">{CITATIONS[2]}</p>
        </Section>

        <Section heading="Check 3 — top mover and run-up">
          <p>
            Whether the ticker appears on the day-gainers screen, and its
            trailing 1-, 5- and 20-session returns. The 20-session return is
            placed as a percentile of that same measure over the loaded
            history, so the comparison is against the ticker&rsquo;s own past
            rather than a threshold chosen elsewhere. The run-up condition is
            met at or above the 90th percentile.
          </p>
          <p className="text-ink-faint">{CITATIONS[3]}</p>
        </Section>

        <Section heading="Check 4 — position sizing and risk of ruin">
          <p>
            Computed only from numbers typed into the form, which are held in
            memory for the length of the request and are never written
            anywhere. The Kelly fraction is p − (1 − p) ÷ b. The risk of ruin
            is a seeded Monte Carlo over 10,000 paths of 50 trades, counting
            the paths whose equity touches the entered ruin threshold at any
            point. It assumes independent trades, fixed fractional sizing, a
            constant win probability and payoff ratio, and no fees or slippage;
            real results differ.
          </p>
          <p className="text-ink-faint">{CITATIONS[4]}</p>
        </Section>

        <Section heading="Check 5 — pattern base rates">
          <p>
            Five detectors are run over the loaded daily bars. Each is
            transcribed literally from its specification, where O, H, L and C
            are the session&rsquo;s open, high, low and close, and t is the
            session being tested:
          </p>
          <dl className="space-y-2">
            {PATTERN_DETECTORS.map((detector) => (
              <div key={detector.id}>
                <dt className="text-ink">{detector.label}</dt>
                <dd className="figure text-xs text-ink-faint">
                  {detector.definition}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            For each detector the report gives the share of occurrences
            followed by a positive return and the median forward return, at 5
            and 20 sessions, next to the unconditional median over the same
            series — what the series did on an average day. The comparison is
            the point: a pattern followed by a rise 55% of the time says little
            if the series rises 55% of the time regardless.
          </p>
          <p className="text-ink-faint">{PATTERN_SOURCE_NOTE}</p>
        </Section>

        <Section heading="How check 5 states its uncertainty">
          <p>
            Occurrences overlap. Two triggers a few sessions apart share most
            of a 20-session outcome, so the raw count N overstates how many
            independent observations there are. Next to N, each horizon shows a
            non-overlapping count, which keeps an occurrence only once the
            previously kept occurrence&rsquo;s forward window has closed. The
            small-sample warning keys off that count.
          </p>
          <p>
            Each median and each difference from the unconditional median
            carries a 95% interval — the 2.5th and 97.5th percentiles over{" "}
            {RESAMPLES.toLocaleString("en-US")} resamples of the series. The
            resampling is a stationary block bootstrap: each session is
            expressed relative to the prior close, blocks of geometrically
            distributed length averaging {MEAN_BLOCK_SESSIONS} sessions are
            drawn and wrapped, a price path is rebuilt from them, and the same
            detectors are re-run on it. Blocks rather than single days are what
            keep the overlap the interval exists to account for. The seed is
            fixed, so the same history yields the same interval every time.
          </p>
          <p>
            Where a pattern is absent from more than 5% of the resamples, both
            intervals are reported as unavailable rather than described from
            only the resamples that happened to contain it.
          </p>
          <p>
            Five detectors at two horizons is ten statistics per ticker, and
            reading any one of them at a nominal 5% invites a false positive by
            construction. The ten therefore carry a Benjamini–Hochberg
            adjustment holding the false-discovery rate to{" "}
            {(FALSE_DISCOVERY_RATE * 100).toFixed(0)}%, reported in one
            sentence on the check. That sentence describes the sample that was
            measured and nothing beyond it.
          </p>
        </Section>

        <Section heading="Check 6 — macro-event proximity">
          <p>
            Scheduled releases falling within three NYSE trading days of the
            report date. Trading days exclude weekends and the exchange&rsquo;s
            published holidays. Release times are 8:30 a.m. Eastern for the
            Bureau of Labor Statistics releases and 2:00 p.m. Eastern for the
            Federal Open Market Committee decision. The calendar is embedded in
            the application and is never fetched while a report is being built,
            so a report cannot be changed by a page moving underneath it. Past
            the end of the embedded calendar the check says so rather than
            reporting that nothing is scheduled.
          </p>
          <ul className="list-inside list-disc text-ink-faint">
            {Object.entries(MACRO_SOURCE_URLS).map(([type, url]) => (
              <li key={type}>{url}</li>
            ))}
          </ul>
        </Section>

        <Section heading="The plain-language summary">
          <p>
            The summary is written from the check results by a fixed template.
            Where a model is configured it rewrites that summary into prose, and
            every number in what it returns is checked against the figures the
            engine computed. If it introduces any other number its output is
            discarded and the template stands. The model never computes
            anything.
          </p>
        </Section>
      </main>
      <DisclaimerBlock />
    </>
  );
}
