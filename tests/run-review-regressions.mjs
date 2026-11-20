import { build } from "vite";

await build({
  configFile: false,
  build: {
    ssr: "tests/review-regressions.ts",
    outDir: "build/review-tests",
    emptyOutDir: false,
  },
});
await import("../build/review-tests/review-regressions.js");
