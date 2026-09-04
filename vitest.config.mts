import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The engine is pure and I/O-free, so the suite runs in the node environment
// by default. The handful of files that need a DOM opt in per file with an
// `@vitest-environment happy-dom` docblock (owner amendment 4), so the rest of
// the suite is not slowed down by constructing one.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    // Check 5 runs a 2,000-resample block bootstrap per ticker, about 0.6 s,
    // so a test that renders reports for all four fixtures does real work well
    // past the 5 s default. This raises the ceiling only; no assertion is
    // relaxed and nothing is skipped.
    testTimeout: 30_000,
  },
});
