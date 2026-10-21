import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // PGlite setup + migrations is CPU-heavy; under parallel files it can exceed the 5 s default.
  test: { environment: "node", testTimeout: 30_000, hookTimeout: 30_000 },
});
