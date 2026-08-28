import { DisclaimerBlock } from "./disclaimer-block";
import { Masthead } from "./masthead";
import { ReportForm } from "./report-form";
import { WaitlistForm } from "./waitlist-form";
import { FIXTURE_SYMBOLS } from "@/fixtures";

export default function Home(): React.ReactElement {
  return (
    <>
      <Masthead />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
          Enter a ticker and the action you are considering. Preflight returns
          six situational checks, each with the figure it is based on and the
          published source it comes from. It does not tell you what to do.
        </p>

        <div className="mt-6">
          <ReportForm sampleSymbols={FIXTURE_SYMBOLS} />
        </div>

        <section className="mt-12 border-t border-rule-strong pt-6">
          <h2 className="text-xs uppercase tracking-widest text-amber">Waitlist</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">
            Leave an address to hear when more tickers and checks are ready.
          </p>
          <WaitlistForm />
        </section>
      </main>
      <DisclaimerBlock />
    </>
  );
}
