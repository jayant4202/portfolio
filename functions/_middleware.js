// Edge middleware for every request that isn't a static asset (see public/_routes.json).
//
// Request lifecycle:
//   1. request.received  — trace context created (or continued from the caller's `traceparent`)
//   2. guard             — canonical-host redirect, method allow-list
//   3. origin.fetch      — static file served via next(), with a timeout
//   4. fallback          — on error, retry straight from the asset store; if that fails, a plain 503
//   5. response.sent     — security headers ensured, trace headers added, one summary log line
//
// The middleware fails open: whatever goes wrong inside it, the visitor still gets the page if the
// asset store can serve it. It holds no secrets and makes no outbound network calls.

import { applySecurityHeaders } from "../lib/edge/security-headers.js";
import { startTrace, requestFields, log, clean } from "../lib/edge/trace.js";

const ORIGIN_TIMEOUT_MS = 10_000;
const READ_METHODS = new Set(["GET", "HEAD"]);

class TimeoutError extends Error {
  constructor(ms) { super(`origin did not respond within ${ms} ms`); this.name = "TimeoutError"; }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(ms)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Canonical host from SITE_URL, or null if it isn't set to a real custom domain. */
function canonicalHost(siteUrl) {
  try {
    const u = new URL(siteUrl);
    return u.protocol === "https:" && !u.hostname.endsWith(".pages.dev") ? u.hostname : null;
  } catch { return null; }
}

/**
 * The production *.pages.dev alias and www. both 301 to the canonical domain, so search engines see
 * one site. Preview deployments (<hash>.<project>.pages.dev) are left alone but marked noindex.
 */
function hostPolicy(url, siteUrl) {
  const host = url.hostname;
  const canon = canonicalHost(siteUrl);
  const isPagesDev = host.endsWith(".pages.dev");
  const isPreview = isPagesDev && host.split(".").length > 3;
  if (canon && host !== canon && (host === `www.${canon}` || (isPagesDev && !isPreview))) {
    return { redirect: `https://${canon}${url.pathname}${url.search}` };
  }
  return { noindex: isPreview };
}

function plain(status, body, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const started = Date.now();
  const url = new URL(request.url);
  const trace = startTrace(request);
  const fields = requestFields(request, url, trace);
  let response;
  let outcome = "ok";
  let error = null;
  let originMs = null;

  try {
    const policy = hostPolicy(url, env && env.SITE_URL);
    if (policy.redirect) {
      outcome = "redirect";
      response = new Response(null, { status: 301, headers: { Location: policy.redirect, "Cache-Control": "public, max-age=3600" } });
    } else if (!url.pathname.startsWith("/api/") && !READ_METHODS.has(request.method)) {
      outcome = "method_not_allowed";
      response = plain(405, "Method not allowed\n", { Allow: "GET, HEAD" });
    } else {
      const t = Date.now();
      response = await withTimeout(next(), ORIGIN_TIMEOUT_MS);
      originMs = Date.now() - t;
    }
    if (policy.noindex) fields.preview = true;
  } catch (e) {
    error = { name: clean(e && e.name, 40), message: clean(e && e.message, 200) };
    if (e instanceof TimeoutError) {
      outcome = "timeout";
      response = plain(504, "This page is taking too long to load. Please try again in a moment.\n", { "Retry-After": "10" });
    } else {
      outcome = "fallback";
      try {
        response = await withTimeout(env.ASSETS.fetch(request), ORIGIN_TIMEOUT_MS);
      } catch (e2) {
        outcome = "error";
        error.fallback = clean(e2 && e2.message, 200);
        response = plain(503, "This site is temporarily unavailable. Please try again in a moment.\n", { "Retry-After": "30" });
      }
    }
  }

  // Responses from next() can be immutable; copy so headers can be set.
  try {
    response = new Response(response.body, response);
    const h = response.headers;
    applySecurityHeaders(h, url.pathname);
    h.set("X-Request-Id", trace.traceId);
    h.set("Reporting-Endpoints", `csp="/api/report?trace=${trace.traceId}"`);
    const total = Date.now() - started;
    h.set("Server-Timing", `edge;dur=${total}` + (originMs != null ? `, origin;dur=${originMs}` : "") + `, trace;desc="${trace.traceId}"`);
    if (fields.preview) h.set("X-Robots-Tag", "noindex, nofollow");
  } catch (e) {
    // Header decoration is best-effort; the page itself is what matters.
    error = error || { name: clean(e && e.name, 40), message: clean(e && e.message, 200) };
  }

  const status = response.status;
  log(error ? (outcome === "fallback" ? "warn" : "error") : status >= 500 ? "error" : status >= 400 ? "warn" : "info", "request", {
    ...fields,
    status,
    outcome,
    duration_ms: Date.now() - started,
    origin_ms: originMs,
    content_type: clean(response.headers.get("content-type"), 60),
    error,
  });
  return response;
}
