import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; it must be required at runtime by Node
  // rather than bundled into the Server Components graph.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
