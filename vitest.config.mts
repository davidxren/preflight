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
  },
});
