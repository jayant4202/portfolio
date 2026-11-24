import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// HTTP-level security checks against `wrangler pages dev`, which applies _headers, _routes.json and
// the Functions middleware as Cloudflare does. These run once (Chromium project) — they test the
// server, not the browser.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "server checks run once");
});

const expected = {};
{
  const lines = readFileSync("public/_headers", "utf8").split("\n");
  for (const line of lines.slice(lines.indexOf("/*") + 1)) {
    if (!line.startsWith("  ")) break;
    const i = line.indexOf(": ");
    expected[line.slice(2, i).toLowerCase()] = line.slice(i + 2);
  }
}

test("pages carry every security header and trace headers", async ({ request }) => {
  for (const path of ["/", "/work", "/about", "/demos", "/privacy", "/this-is-a-404", "/robots.txt", "/.well-known/security.txt"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    for (const [name, value] of Object.entries(expected)) {
      if (name === "reporting-endpoints") {
        expect(h[name], `${path} ${name}`).toMatch(/^csp="\/api\/report\?trace=[0-9a-f]{32}"$/);
      } else {
        expect(h[name], `${path} ${name}`).toBe(value);
      }
    }
    expect(h["x-request-id"], `${path} x-request-id`).toMatch(/^[0-9a-f]{32}$/);
    expect(h["server-timing"], `${path} server-timing`).toContain(`trace;desc="${h["x-request-id"]}"`);
  }
});

test("static assets get security headers but bypass the middleware", async ({ request }) => {
  const res = await request.get("/assets/css/style.css");
  expect(res.ok()).toBe(true);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["cross-origin-resource-policy"]).toBe("same-origin");
  expect(res.headers()["x-request-id"]).toBeUndefined();
});

test("PDFs drop the page CSP; the resume downloads as an attachment", async ({ request }) => {
  const res = await request.get("/assets/Jayant-Goswami-Resume.pdf");
  expect(res.headers()["content-security-policy"]).toBeUndefined();
  expect(res.headers()["content-disposition"]).toContain("attachment");
});

test("non-read methods on pages are refused", async ({ request }) => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const res = await request.fetch("/", { method });
    expect(res.status(), method).toBe(405);
  }
});

test("the trace ID from a caller's traceparent is continued", async ({ request }) => {
  const res = await request.get("/", { headers: { traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" } });
  expect(res.headers()["x-request-id"]).toBe("0123456789abcdef0123456789abcdef");
});

test("/security.txt redirects to the RFC 9116 location", async ({ request }) => {
  const res = await request.get("/security.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()["location"]).toBe("/.well-known/security.txt");
});

test("security.txt is valid and not expired", async ({ request }) => {
  const body = await (await request.get("/.well-known/security.txt")).text();
  expect(body).toMatch(/^Contact: https:\/\//m);
  const expires = new Date(body.match(/^Expires: (.+)$/m)[1]);
  const days = (expires - Date.now()) / 86_400_000;
  expect(days, "days until Expires").toBeGreaterThan(30);
  expect(days, "Expires must be under a year away").toBeLessThanOrEqual(366);
});

test("CSP report endpoint accepts valid reports and rejects abuse", async ({ request }) => {
  const ok = await request.post("/api/report?trace=0123456789abcdef0123456789abcdef", {
    headers: { "content-type": "application/reports+json" },
    data: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "inline" } }]),
  });
  expect(ok.status()).toBe(204);
  expect(await ok.body()).toHaveLength(0);
  expect((await request.post("/api/report", { headers: { "content-type": "text/plain" }, data: Buffer.from("x") })).status()).toBe(415);
  expect((await request.post("/api/report", { headers: { "content-type": "application/json" }, data: Buffer.from("{bad") })).status()).toBe(400);
  expect((await request.post("/api/report", { headers: { "content-type": "application/json" }, data: Buffer.from("a".repeat(20_000)) })).status()).toBe(413);
  expect((await request.get("/api/report")).status()).toBe(405);
});

// `_headers` and `_routes.json` are not listed: the local emulator handles them differently from
// Cloudflare (production returns 404 for both, which scripts/smoke.sh checks against the live site).
test("source, config and docs are never served", async ({ request }) => {
  for (const path of ["/build.sh", "/README.md", "/SECURITY.md", "/package.json", "/functions/_middleware.js",
    "/lib/edge/trace.js", "/.env", "/docs/OPERATIONS.md", "/tests/unit/report.test.js"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("robots.txt keeps search open and opts out of AI training", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toMatch(/User-agent: \*\nAllow: \/\n/);
  expect(body, "non-standard directives fail robots.txt validators").not.toContain("Content-Signal");
  expect(body).toContain("User-agent: GPTBot");
  expect(body).toMatch(/^Sitemap: https?:\/\//m);
});
