import { describe, it, expect } from "vitest";
import { startTrace, clean, urlWithoutQuery, originOnly, clientClass } from "../../lib/edge/trace.js";
import { SECURITY_HEADERS, applySecurityHeaders } from "../../lib/edge/security-headers.js";
import { readFileSync } from "node:fs";

describe("trace helpers", () => {
  it("generates unique, well-formed IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const t = startTrace(new Request("https://x/"));
      expect(t.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(t.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(t.traceparent).toBe(`00-${t.traceId}-${t.spanId}-01`);
      ids.add(t.traceId);
    }
    expect(ids.size).toBe(1000);
  });

  it("cleans strings", () => {
    expect(clean(null)).toBeNull();
    expect(clean("a\nb\u0000c")).toBe("a b c");
    expect(clean("x".repeat(10), 5)).toBe("xxxxx…");
  });

  it.each([
    ["https://a.com/p?q=1#h", "https://a.com/p"],
    ["chrome-extension://abc/x.js", "chrome-extension:"],
    ["inline", "inline"],
    [null, null],
  ])("urlWithoutQuery(%j) = %j", (input, out) => {
    expect(urlWithoutQuery(input)).toBe(out);
  });

  it("reduces referrers to their origin", () => {
    expect(originOnly("https://www.google.com/search?q=x")).toBe("https://www.google.com");
    expect(originOnly("not a url")).toBeNull();
  });

  it.each([
    ["Mozilla/5.0 (Macintosh) Safari", "browser"],
    ["Googlebot/2.1", "bot"],
    ["curl/8.0", "bot"],
    ["", "unknown"],
    ["SomethingElse/1", "other"],
  ])("clientClass(%j) = %s", (ua, cls) => {
    expect(clientClass(ua)).toBe(cls);
  });
});

describe("security header baseline", () => {
  it("matches the /* block of public/_headers exactly", () => {
    const lines = readFileSync("public/_headers", "utf8").split("\n");
    const start = lines.indexOf("/*");
    const block = {};
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith("  ")) break;
      const i = line.indexOf(": ");
      block[line.slice(2, i)] = line.slice(i + 2);
    }
    expect(SECURITY_HEADERS).toEqual(block);
  });

  it("only fills in missing headers", () => {
    const h = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
    applySecurityHeaders(h, "/");
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(h.get("content-security-policy")).toBe(SECURITY_HEADERS["Content-Security-Policy"]);
  });

  it("keeps the CSP off PDFs", () => {
    for (const p of ["/assets/docs/memo.pdf", "/assets/Jayant-Goswami-Resume.pdf"]) {
      const h = new Headers();
      applySecurityHeaders(h, p);
      expect(h.has("content-security-policy")).toBe(false);
    }
  });

  it("keeps the CSP strict", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });
});
