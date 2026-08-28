import { DisclaimerBlock } from "./disclaimer-block";
import { Masthead } from "./masthead";

export default function Home(): React.ReactElement {
  return (
    <>
      <Masthead />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-sm text-ink-muted">
          Enter a ticker and the action you are considering. Preflight returns
          six situational checks with citations.
        </p>
      </main>
      <DisclaimerBlock />
    </>
  );
}
