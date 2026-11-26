# Architecture

## Goals and constraints

1. **Fast and always available.** Pages are static files on a global CDN, with no origin server to
   fail.
2. **Minimal attack surface.** No dependencies, no state, no secrets; the only third-party code is
   Cloudflare Web Analytics, from the same provider that already hosts the site.
3. **Robust by default.** Every enhancement degrades gracefully: no JavaScript, no CSS, a missing
   image or a failed video still leaves a usable page.
4. **Unsafe changes can't ship.** Correctness and security rules are enforced by the build, not by
   reviewers remembering them.
5. **Observable.** Every request that reaches the edge code can be traced and diagnosed.

## Components

```
Browser
  │ HTTPS
  ▼
Cloudflare edge: DDoS · WAF · Bot Fight Mode · AI Labyrinth · AI crawler policy
  │
  ▼
_routes.json ──── /assets/* ─────────────────────────────▶ Static asset store (+ public/_headers)
  │
  │ every other path
  ▼
functions/_middleware.js
  1. trace context (W3C traceparent)
  2. guard: canonical-host 301, method allow-list
  3. next() ─────────────────────────────────────────────▶ Static asset store, or functions/api/report.js
  4. on error: env.ASSETS.fetch → plain 503 (504 on timeout)
  5. headers: security baseline, X-Request-Id, Server-Timing, Reporting-Endpoints?trace=…
  6. one JSON log line ──────────────────────────────────▶ Real-time logs / wrangler tail
  │
  ▼
Browser ── CSP violation ── POST /api/report?trace=<page trace> ──▶ functions/api/report.js ──▶ log
```

| Component | Responsibility | Failure behaviour |
|---|---|---|
| Static asset store | Serves `dist/`; applies `_headers` | Cloudflare-managed |
| `_routes.json` | Keeps `/assets/*` off Functions, so they're free, fast and unaffected by edge bugs | — |
| `functions/_middleware.js` | Tracing, header baseline, host canonicalisation | Fails open to the asset store; 10 s origin timeout returns 504 |
| `functions/api/report.js` | Ingests CSP reports | Always 204 for valid input; 4xx for malformed or abusive input |
| `lib/edge/*` | Shared, pure helpers | No I/O except `console` |
| `theme.js` | Applies the saved theme before first paint | Storage blocked → dark default |
| `main.js` | Theme picker, menu, filters, media fallbacks | Each feature in its own `try/catch`; one failure never cascades |

## Request lifecycle

For a page request such as `GET /work.html`:

1. **Edge security:** Cloudflare's WAF, bot and DDoS layers run first. Requests they block never
   reach our code.
2. **Routing:** `_routes.json` includes `/*` and excludes `/assets/*`, so the middleware runs.
3. **Trace context:** `startTrace` continues a valid incoming `traceparent` or starts a new
   128-bit trace ID. Every request gets a new 64-bit span ID.
4. **Guard:**
   - `*.pages.dev` production aliases and `www.` 301-redirect to the canonical `SITE_URL`. Preview
     deployments are left reachable but marked `noindex`.
   - Methods other than `GET` and `HEAD` get `405`, except under `/api/`.
5. **Origin:** `next()` serves the static file, raced against a 10 s timeout.
6. **Fallback:** if `next()` throws, the middleware retries via `env.ASSETS.fetch`. If that also
   fails, it returns a plain-text 503 with `Retry-After`. A timeout returns a 504.
7. **Decorate:** adds any missing baseline security header, plus `X-Request-Id`, `Server-Timing`
   (`edge`, `origin`, `trace`) and a per-request `Reporting-Endpoints` URL that carries the trace ID.
8. **Log:** writes one structured line with status, outcome, durations and sanitised request
   metadata.
9. **Browser:** if the page's CSP blocks something, the browser POSTs a report to
   `/api/report?trace=<id>`. That report is logged with `page_trace_id`, which links it back to step 8.

Static assets (`/assets/*`) take the short path: the CDN serves them with `_headers`, and they get
no trace.

## Key decisions

**Static HTML rather than a framework or static-site generator.** About 15 pages don't justify a
toolchain. Plain files remove the dependency supply chain, make the CSP trivially strict, and keep
the site maintainable by a non-engineer. The trade-off is that shared markup (header, footer) is
duplicated; the build's structural checks keep that safe.

**The build script as the policy engine.** Rules that matter (outbound links, SRI, PDF safety,
header parity) are executable and block deploys. Documentation alone drifts; a failing build doesn't.

**Middleware only for documents.** Running Functions on every asset would multiply invocations
about tenfold. Static asset requests are free and unlimited, Functions requests are metered, and
assets gain nothing from tracing. Excluding them also means an edge-code bug can never break images,
CSS or JS.

**Duplicated header definitions, enforced equal.** Cloudflare documents that `_headers` is not
applied to Functions responses. Rather than trust the static path alone, the middleware re-asserts
the same baseline (only where a header is missing, so path-specific rules still win). The build
fails if the two definitions diverge.

**Fail open.** For a portfolio, availability beats strictness inside the middleware: tracing is
best-effort, the page is not. The security headers are still applied on the fallback path.

**Dark theme by default.** The stylesheet treats a missing `data-theme` as dark, so the default
holds even with JavaScript disabled. `theme.js` is render-blocking on purpose: it's tiny and it
avoids a flash of the wrong theme. "System" defers to `prefers-color-scheme`.

**Content-hashed asset filenames plus SRI.** Every CSS, JS and image file is served from
`/assets/h/<name>.<sha256 of file + _headers>.<ext>` with a one-year `immutable` cache. SRI makes any
byte-level tampering fatal for that asset rather than exploitable.

*Why filenames, not `?v=` query strings (incident, v1.4.0, 2026-11-26).* Cloudflare Pages ignores
query strings. While a deploy propagated, a browser got the new HTML (new `?v=`) and the old
stylesheet bytes. SRI then correctly blocked the stylesheet, and the new year-long cache pinned the
bad copy, so the page stayed unstyled in that browser. With hashed filenames, a URL can only ever
return one version. A file that hasn't arrived yet is a 404 (`no-store`, never cached), and a
one-time automatic reload in `main.js` recovers the page. Original paths stay available with a
1-day cache for direct links.

## Extending

- **Embedding a hosted prototype:** add its origin to `frame-src` in both header files, to
  `DEMO_HOST_SUFFIXES` in `main.js`, and to the build allow-list. Note that COEP `require-corp`
  requires the embedded site to send CORP/CORS headers, or the frame will be blocked.
- **New API endpoint:** add `functions/api/<name>.js` exporting `onRequestPost` / `onRequestGet`
  and a catch-all `onRequest` that returns 405. Validate content type and size, sanitise everything
  you log, and keep it free of outbound calls unless you deliberately relax the build rule.
- **Persistent logs:** see [OBSERVABILITY.md](OBSERVABILITY.md#retention).
