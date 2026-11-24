import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against `wrangler pages dev`, which serves dist/ the way Cloudflare Pages does:
// _headers, _routes.json and the Functions middleware all apply, so security headers and tracing are
// tested for real. Run with `npm run test:e2e` (builds first).
//
// The server runs over HTTPS (self-signed) because the production CSP includes
// `upgrade-insecure-requests`: WebKit upgrades even localhost requests, so a plain-HTTP test server
// would break every asset in Safari-engine tests. HTTPS keeps the policy identical to production.
const PORT = 8788;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `https://localhost:${PORT}`,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `npx wrangler pages dev dist --port ${PORT} --compatibility-date=2025-01-01 --local-protocol=https`,
    url: `https://localhost:${PORT}/`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
