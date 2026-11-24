import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestPost, onRequest, classify } from "../../functions/api/report.js";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
let logs;
let ipCounter = 0;

beforeEach(() => {
  logs = [];
  for (const level of ["log", "warn", "error"]) {
    vi.spyOn(console, level).mockImplementation((line) => logs.push(JSON.parse(line)));
  }
});
afterEach(() => vi.restoreAllMocks());

const post = (body, { type = "application/reports+json", query = `?trace=${TRACE}`, ip } = {}) =>
  onRequestPost({
    request: new Request(`https://jayantgoswami.com/api/report${query}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": type, "cf-connecting-ip": ip || `198.51.100.${ipCounter++ % 250}` },
    }),
  });

const violation = (body) => [{ type: "csp-violation", url: "https://jayantgoswami.com/work", body }];

describe("valid reports", () => {
  it("accepts a Reporting API report, returns an empty 204 and logs it against the page trace", async () => {
    const res = await post(violation({
      documentURL: "https://jayantgoswami.com/work?email=a@b.c",
      effectiveDirective: "script-src-elem",
      blockedURL: "https://evil.example/x.js?token=abc",
      lineNumber: 3,
      disposition: "enforce",
    }));
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(logs.at(-1)).toMatchObject({
      event: "csp.violation", level: "warn", origin: "unknown", page_trace_id: TRACE,
      format: "reporting-api", directive: "script-src-elem", blocked: "https://evil.example/x.js", line: 3,
    });
    const raw = JSON.stringify(logs);
    expect(raw).not.toContain("a@b.c");
    expect(raw).not.toContain("token");
  });

  it("accepts the legacy report-uri format", async () => {
    const res = await post(
      { "csp-report": { "document-uri": "https://jayantgoswami.com/", "violated-directive": "img-src", "blocked-uri": "inline" } },
      { type: "application/csp-report" },
    );
    expect(res.status).toBe(204);
    expect(logs.at(-1)).toMatchObject({ format: "report-uri", directive: "img-src", blocked: "inline" });
  });

  it("logs at most 20 reports per request", async () => {
    const many = Array.from({ length: 50 }, () => ({ type: "csp-violation", body: { effectiveDirective: "x" } }));
    expect((await post(many)).status).toBe(204);
    expect(logs.filter((l) => l.event === "csp.violation")).toHaveLength(20);
  });

  it("ignores junk entries", async () => {
    expect((await post([1, null, "x", { type: "other" }])).status).toBe(204);
    expect(logs.at(-1).event).toBe("csp.report.empty");
  });
});

describe("classification", () => {
  it.each([
    [{ source: "chrome-extension://abc/x.js" }, "browser-extension"],
    [{ blocked: "moz-extension:" }, "browser-extension"],
    [{ sample: "(function(){function c(){var b=a.contentDocument||(a.con" }, "cloudflare-bot-detection"],
    [{ sample: "window.__CF$cv$params={r:'x'}" }, "cloudflare-bot-detection"],
    [{ blocked: "https://evil.example/x.js" }, "unknown"],
    [{}, "unknown"],
  ])("classifies %j as %s", (report, expected) => {
    expect(classify(report)).toBe(expected);
  });

  it("logs expected noise at info and unknown violations at warn", async () => {
    await post(violation({ effectiveDirective: "script-src-elem", sourceFile: "chrome-extension://abc/x.js" }));
    expect(logs.at(-1)).toMatchObject({ origin: "browser-extension", level: "info" });
    await post(violation({ effectiveDirective: "script-src-elem", blockedURL: "https://evil.example/" }));
    expect(logs.at(-1)).toMatchObject({ origin: "unknown", level: "warn" });
  });
});

describe("hostile input", () => {
  it("rejects an unexpected content type with 415", async () => {
    expect((await post("{}", { type: "text/plain" })).status).toBe(415);
  });

  it("rejects invalid JSON with 400", async () => {
    expect((await post("{not json")).status).toBe(400);
  });

  it("rejects bodies over 16 KB with 413", async () => {
    expect((await post("x".repeat(17 * 1024))).status).toBe(413);
  });

  it("ignores a malformed trace parameter", async () => {
    await post(violation({ effectiveDirective: "x" }), { query: '?trace=../../etc"}' });
    expect(logs.at(-1).page_trace_id).toBeNull();
  });

  it("strips control characters and caps field lengths", async () => {
    await post(violation({ effectiveDirective: "a\nfake-line\u0000", blockedURL: "x".repeat(5000), sample: "y".repeat(500) }));
    const l = logs.at(-1);
    expect(l.directive).not.toMatch(/[\n\u0000]/);
    expect(l.blocked.length).toBeLessThanOrEqual(41);
    expect(l.sample.length).toBeLessThanOrEqual(61);
  });

  it("rate-limits one client to 30 reports a minute without logging its IP", async () => {
    const codes = [];
    for (let i = 0; i < 35; i++) codes.push((await post(violation({ effectiveDirective: "x" }), { ip: "192.0.2.77" })).status);
    expect(codes.slice(0, 30).every((c) => c === 204)).toBe(true);
    expect(codes.slice(30).every((c) => c === 429)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("192.0.2.77");
  });

  it("answers anything but POST with 405", () => {
    const res = onRequest();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});
