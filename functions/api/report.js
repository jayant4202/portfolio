// POST /api/report — receives Content-Security-Policy violation reports from visitors' browsers.
//
// Browsers send these automatically when the page's security policy blocks something (for example a
// browser extension injecting a script, or a real attack). Each report is logged with the trace ID of
// the page view that triggered it, so a violation can be tied back to the request that served the page.
//
// Hardening: POST only, known content types only, 16 KB body cap, at most 20 reports per request,
// per-isolate rate limiting, every field sanitised, nothing echoed back, no storage, always 204.

import { log, clean, urlWithoutQuery, TRACE_ID } from "../../lib/edge/trace.js";

const MAX_BYTES = 16 * 1024;
const MAX_REPORTS = 20;
const TYPES = ["application/reports+json", "application/csp-report", "application/json"];
const RATE = { windowMs: 60_000, perClient: 30, global: 1_000 };

// In-memory, per-isolate limiter. It resets when the isolate recycles: it blunts floods, and
// Cloudflare's own DDoS and bot protection sit in front of it. Client keys are never logged.
const buckets = new Map();
let globalWindow = { start: 0, count: 0 };

function rateLimited(key, now) {
  if (now - globalWindow.start > RATE.windowMs) globalWindow = { start: now, count: 0 };
  if (++globalWindow.count > RATE.global) return true;
  if (buckets.size > 5_000) buckets.clear();
  const b = buckets.get(key);
  if (!b || now - b.start > RATE.windowMs) { buckets.set(key, { start: now, count: 1 }); return false; }
  return ++b.count > RATE.perClient;
}

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const reject = (status, extra = {}) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } });

/** Reads the body as text, stopping as soon as it exceeds the cap. Returns null if too large. */
async function readCapped(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** Normalises both report formats (Reporting API and legacy report-uri) into one safe shape. */
function normalise(payload) {
  const out = [];
  const items = Array.isArray(payload) ? payload : [payload];
  for (const item of items.slice(0, MAX_REPORTS)) {
    if (!item || typeof item !== "object") continue;
    if (item["csp-report"] && typeof item["csp-report"] === "object") {
      const r = item["csp-report"];
      out.push({
        format: "report-uri",
        document: urlWithoutQuery(r["document-uri"]),
        directive: clean(r["effective-directive"] || r["violated-directive"], 60),
        blocked: urlWithoutQuery(r["blocked-uri"]),
        source: urlWithoutQuery(r["source-file"]),
        line: Number.isInteger(r["line-number"]) ? r["line-number"] : null,
        disposition: clean(r.disposition, 20),
      });
    } else if (item.type === "csp-violation" && item.body && typeof item.body === "object") {
      const b = item.body;
      out.push({
        format: "reporting-api",
        document: urlWithoutQuery(b.documentURL || item.url),
        directive: clean(b.effectiveDirective, 60),
        blocked: urlWithoutQuery(b.blockedURL),
        source: urlWithoutQuery(b.sourceFile),
        line: Number.isInteger(b.lineNumber) ? b.lineNumber : null,
        disposition: clean(b.disposition, 20),
      });
    }
  }
  return out;
}

export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const traceParam = (url.searchParams.get("trace") || "").toLowerCase();
  const pageTrace = TRACE_ID.test(traceParam) ? traceParam : null;
  const ctype = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  if (!TYPES.includes(ctype)) return reject(415);
  const key = request.headers.get("cf-connecting-ip") || "unknown";
  if (rateLimited(key, Date.now())) {
    log("warn", "csp.report.rate_limited", { page_trace_id: pageTrace });
    return reject(429, { "Retry-After": "60" });
  }

  let text;
  try { text = await readCapped(request); } catch { return reject(400); }
  if (text === null) return reject(413);

  let payload;
  try { payload = JSON.parse(text); } catch { return reject(400); }

  const reports = normalise(payload);
  for (const r of reports) log("warn", "csp.violation", { page_trace_id: pageTrace, ...r });
  if (!reports.length) log("info", "csp.report.empty", { page_trace_id: pageTrace });
  return noContent();
}

// Anything other than POST.
export function onRequest() {
  return reject(405, { Allow: "POST" });
}
