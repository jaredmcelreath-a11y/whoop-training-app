import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its WASM/data files relative to its own package; bundling breaks those paths.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
