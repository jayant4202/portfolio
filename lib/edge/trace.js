// Request tracing for Pages Functions: W3C Trace Context IDs + one structured JSON log line per event.
//
// Logs go to console, which Cloudflare streams to the dashboard (Deployment → Functions → Real-time
// logs) and to `wrangler pages deployment tail`. Each line is a single JSON object so it can be
// filtered with `jq` or shipped to a log store unchanged.
//
// Privacy: no IP addresses, cookies, query strings or request bodies are ever logged. User agents are
// truncated and referrers are reduced to their origin. As a last line of defence, every log line is
// passed through redactDeep() (lib/edge/pii.js), which strips any email, phone number or IP address
// that slips into a field (for example an email typed into a URL path). See docs/OBSERVABILITY.md.

import { redactDeep } from "./pii.js";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);
export const TRACE_ID = /^[0-9a-f]{32}$/;

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Continues the caller's trace if it sent a valid `traceparent` header, otherwise starts a new one.
 * Every request gets its own span ID.
 */
export function startTrace(request) {
  const m = TRACEPARENT.exec((request.headers.get("traceparent") || "").trim().toLowerCase());
  const valid = m && m[1] !== ZERO_TRACE && m[2] !== ZERO_SPAN;
  const traceId = valid ? m[1] : randomHex(16);
  const spanId = randomHex(8);
  return {
    traceId,
    spanId,
    parentSpanId: valid ? m[2] : null,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

/** Trims a string and strips control characters so log lines stay one line and readable. */
export function clean(value, max = 200) {
  if (value == null) return null;
  // eslint-disable-next-line no-control-regex
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, " ");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Reduces a URL to origin + path (no query string or fragment, which can carry personal data). */
export function urlWithoutQuery(raw, max = 200) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return clean(u.protocol, 20);
    return clean(u.origin + u.pathname, max);
  } catch {
    return clean(raw, 40); // e.g. "inline", "eval"
  }
}

export function originOnly(raw) {
  if (!raw) return null;
  try { return new URL(raw).origin; } catch { return null; }
}

/** Coarse client class, useful for spotting bot traffic without storing full user agents. */
export function clientClass(ua) {
  if (!ua) return "unknown";
  if (/bot|crawl|spider|slurp|fetch|curl|wget|python|httpclient|headless/i.test(ua)) return "bot";
  if (/mozilla|safari|chrome|firefox|edg/i.test(ua)) return "browser";
  return "other";
}

/** Fields describing the request, shared by every log line of that request. */
export function requestFields(request, url, trace) {
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent");
  return {
    trace_id: trace.traceId,
    span_id: trace.spanId,
    parent_span_id: trace.parentSpanId,
    cf_ray: clean(request.headers.get("cf-ray"), 40),
    method: request.method,
    host: clean(url.hostname, 100),
    path: clean(url.pathname, 200),
    has_query: url.search.length > 1,
    referrer_origin: originOnly(request.headers.get("referer")),
    client: clientClass(ua),
    user_agent: clean(ua, 160),
    colo: cf.colo || null,
    country: cf.country || null,
    http_protocol: cf.httpProtocol || null,
    tls_version: cf.tlsVersion || null,
  };
}

/** Writes one structured log line. Logging must never break a request, so failures are swallowed. */
export function log(level, event, fields) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redactDeep(fields) });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } catch {
    /* never throw from logging */
  }
}
