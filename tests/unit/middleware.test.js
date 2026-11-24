import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../../functions/_middleware.js";
import { SECURITY_HEADERS } from "../../lib/edge/security-headers.js";

const HEX32 = /^[0-9a-f]{32}$/;
let logs;

beforeEach(() => {
  logs = [];
  for (const level of ["log", "warn", "error"]) {
    vi.spyOn(console, level).mockImplementation((line) => logs.push(JSON.parse(line)));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const lastLog = () => logs.at(-1);
const cf = { colo: "BOM", country: "IN", httpProtocol: "HTTP/2", tlsVersion: "TLSv1.3" };
const req = (url, { method = "GET", headers = {}, withCf = true } = {}) => ({
  method,
  url,
  headers: new Headers(headers),
  ...(withCf ? { cf } : {}),
});
const page = () => new Response("<h1>hi</h1>", { headers: { "content-type": "text/html" } });
const env = (over = {}) => ({
  SITE_URL: "https://jayantgoswami.com",
  ASSETS: { fetch: async () => new Response("asset", { headers: { "content-type": "text/html" } }) },
  ...over,
});
const run = (request, next = async () => page(), e = env()) => onRequest({ request, env: e, next });

describe("normal requests", () => {
  it("passes the page through and adds every baseline security header", async () => {
    const res = await run(req("https://jayantgoswami.com/work"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>hi</h1>");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (name === "Reporting-Endpoints") continue; // replaced per request, tested below
      expect(res.headers.get(name), name).toBe(value);
    }
  });

  it("returns trace headers that all carry the same trace ID", async () => {
    const res = await run(req("https://jayantgoswami.com/"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(HEX32);
    expect(res.headers.get("reporting-endpoints")).toBe(`csp="/api/report?trace=${id}"`);
    expect(res.headers.get("server-timing")).toMatch(
      new RegExp(`^edge;dur=\\d+, origin;dur=\\d+, trace;desc="${id}"$`),
    );
  });

  it("writes one structured log line with request metadata", async () => {
    await run(
      req("https://jayantgoswami.com/work?utm=secret", {
        headers: {
          "user-agent": "Mozilla/5.0 Chrome",
          referer: "https://www.google.com/search?q=private",
          "cf-connecting-ip": "203.0.113.9",
          "cf-ray": "abc-BOM",
        },
      }),
    );
    expect(logs).toHaveLength(1);
    expect(lastLog()).toMatchObject({
      level: "info", event: "request", method: "GET", path: "/work", has_query: true, status: 200,
      outcome: "ok", colo: "BOM", country: "IN", cf_ray: "abc-BOM", client: "browser",
      referrer_origin: "https://www.google.com",
    });
    expect(typeof lastLog().duration_ms).toBe("number");
  });

  it("never logs IP addresses, query strings or full referrers", async () => {
    await run(
      req("https://jayantgoswami.com/work?email=a@b.c", {
        headers: { referer: "https://x.com/p?token=t0k", "cf-connecting-ip": "203.0.113.9" },
      }),
    );
    const raw = JSON.stringify(logs);
    for (const secret of ["203.0.113.9", "a@b.c", "t0k", "email="]) expect(raw).not.toContain(secret);
  });

  it("tolerates a request without Cloudflare metadata", async () => {
    const res = await run(req("https://jayantgoswami.com/", { withCf: false }));
    expect(res.status).toBe(200);
    expect(lastLog().colo).toBeNull();
  });
});

describe("trace context", () => {
  it("continues a valid W3C traceparent with a new span", async () => {
    const res = await run(
      req("https://jayantgoswami.com/", {
        headers: { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
      }),
    );
    expect(res.headers.get("x-request-id")).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(lastLog().parent_span_id).toBe("00f067aa0ba902b7");
    expect(lastLog().span_id).not.toBe("00f067aa0ba902b7");
  });

  it.each([
    "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
    "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
    "garbage",
    '00-XYZ"}{-a-01',
    "",
  ])("starts a new trace for invalid traceparent %j", async (tp) => {
    const res = await run(req("https://jayantgoswami.com/", { headers: tp ? { traceparent: tp } : {} }));
    expect(res.headers.get("x-request-id")).toMatch(HEX32);
    expect(res.headers.get("x-request-id")).not.toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(lastLog().parent_span_id).toBeNull();
  });
});

describe("guards", () => {
  it.each(["POST", "PUT", "DELETE", "PATCH", "OPTIONS"])("rejects %s on pages with 405", async (method) => {
    const res = await run(req("https://jayantgoswami.com/", { method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(res.headers.has("content-security-policy")).toBe(true);
  });

  it("allows HEAD", async () => {
    expect((await run(req("https://jayantgoswami.com/", { method: "HEAD" }))).status).toBe(200);
  });

  it("passes POST under /api/ to the handler", async () => {
    const next = vi.fn(async () => new Response(null, { status: 204 }));
    const res = await run(req("https://jayantgoswami.com/api/report", { method: "POST" }), next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(204);
  });
});

describe("host and path policy", () => {
  it.each([
    ["https://jayantgoswami.pages.dev/about?x=1", "https://jayantgoswami.com/about?x=1"],
    ["https://www.jayantgoswami.com/", "https://jayantgoswami.com/"],
    ["https://www.jayantgoswami.com/security.txt", "https://jayantgoswami.com/security.txt"],
    ["https://jayantgoswami.com/security.txt", "/.well-known/security.txt"],
  ])("redirects %s to %s", async (from, to) => {
    const res = await run(req(from));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(to);
  });

  it("marks preview deployments noindex without redirecting", async () => {
    const res = await run(req("https://3f2a1b.jayantgoswami.pages.dev/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each([
    ["SITE_URL is a pages.dev address", "https://jayantgoswami.pages.dev"],
    ["SITE_URL is unset", undefined],
    ["SITE_URL is garbage", "not a url"],
  ])("does not redirect when %s", async (_, siteUrl) => {
    const res = await run(req("https://jayantgoswami.pages.dev/"), undefined, env({ SITE_URL: siteUrl }));
    expect(res.status).toBe(200);
  });

  it.each(["/__proto__", "/constructor", "/toString"])("does not treat %s as an alias", async (p) => {
    expect((await run(req(`https://jayantgoswami.com${p}`))).status).toBe(200);
  });

  it("never redirects a foreign host", async () => {
    expect((await run(req("https://evil.example/"))).status).toBe(200);
  });
});

describe("failure handling", () => {
  it("falls back to the asset store when next() throws", async () => {
    const res = await run(req("https://jayantgoswami.com/"), async () => { throw new Error("boom"); });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset");
    expect(lastLog()).toMatchObject({ outcome: "fallback", level: "warn", error: { message: "boom" } });
  });

  it("returns a 503 with security headers when the fallback also fails", async () => {
    const res = await run(
      req("https://jayantgoswami.com/"),
      async () => { throw new Error("boom"); },
      env({ ASSETS: { fetch: async () => { throw new Error("store down"); } } }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.has("content-security-policy")).toBe(true);
    expect(lastLog()).toMatchObject({ outcome: "error", level: "error" });
  });

  it("returns a 504 when the origin hangs past the timeout", async () => {
    vi.useFakeTimers();
    const pending = run(req("https://jayantgoswami.com/"), () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(lastLog()).toMatchObject({ outcome: "timeout", level: "error" });
  });

  it("handles immutable responses such as Response.redirect", async () => {
    const res = await run(req("https://jayantgoswami.com/"), async () => Response.redirect("https://jayantgoswami.com/work", 308));
    expect(res.status).toBe(308);
    expect(res.headers.get("x-request-id")).toMatch(HEX32);
  });

  it("never overrides a header the response already set", async () => {
    const res = await run(
      req("https://jayantgoswami.com/x"),
      async () => new Response("nf", { status: 404, headers: { "content-security-policy": "default-src 'none'" } }),
    );
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(lastLog().level).toBe("warn");
  });

  it("does not add the page CSP to PDFs", async () => {
    const res = await run(req("https://jayantgoswami.com/assets/docs/a.pdf"));
    expect(res.headers.has("content-security-policy")).toBe(false);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
