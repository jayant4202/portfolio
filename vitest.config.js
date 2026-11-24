import { defineConfig } from "vitest/config";

// Unit tests for the edge code. The code uses only Web-standard APIs (Request, Response, Headers,
// crypto, streams), which Node 20+ provides natively, so tests run in plain Node.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
    coverage: { include: ["functions/**", "lib/**"] },
  },
});
