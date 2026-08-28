import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The engine is pure and I/O-free, so the whole suite runs in the node
// environment; no jsdom dependency is pulled in for it.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
