# Observability

## Model

Every document request (anything outside `/assets/*`) produces **one trace span** and **one
structured log line** at the edge. Identifiers follow [W3C Trace Context](https://www.w3.org/TR/trace-context/):

| Field | Source |
|---|---|
| `trace_id` | 128-bit hex. Continued from a valid incoming `traceparent` header, otherwise newly generated |
| `span_id` | 64-bit hex, new for every request |
| `parent_span_id` | The caller's span when `traceparent` was supplied, else `null` |
| `cf_ray` | Cloudflare's Ray ID. Use it when contacting Cloudflare support or reading Security Events |

The trace ID is returned to the client three ways, so any request can be tied to its log line:

- `X-Request-Id: <trace_id>`
- `Server-Timing: edge;dur=<ms>, origin;dur=<ms>, trace;desc="<trace_id>"`. This is also readable
  from page JavaScript via `performance.getEntriesByType("navigation")[0].serverTiming`.
- `Reporting-Endpoints: csp="/api/report?trace=<trace_id>"`, which makes browser CSP reports carry
  the trace of the page that caused them.

## Log schema

One JSON object per line. Request log (`event: "request"`):

```json
{
  "ts": "2026-11-22T10:15:03.120Z", "level": "info", "event": "request",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736", "span_id": "a1b2c3d4e5f60718", "parent_span_id": null,
  "cf_ray": "8f1c2d3e4f5a6b7c-BOM", "method": "GET", "host": "jayantgoswami.com", "path": "/work.html",
  "has_query": false, "referrer_origin": "https://www.google.com", "client": "browser",
  "user_agent": "Mozilla/5.0 (Macintosh; …", "colo": "BOM", "country": "IN",
  "http_protocol": "HTTP/3", "tls_version": "TLSv1.3",
  "status": 200, "outcome": "ok", "duration_ms": 14, "origin_ms": 12,
  "content_type": "text/html; charset=utf-8", "error": null
}
```

| `outcome` | Meaning | Level |
|---|---|---|
| `ok` | Served normally | info (warn for 4xx, error for 5xx) |
| `redirect` | Non-canonical host sent a 301 to `SITE_URL` | info |
| `method_not_allowed` | Non-GET/HEAD to a page, so a 405 | warn |
| `fallback` | `next()` threw; served from the asset store instead | warn |
| `timeout` | Origin exceeded 10 s; a 504 was returned | error |
| `error` | Both origin and fallback failed; a 503 was returned | error |

CSP report log (`event: "csp.violation"`): `page_trace_id`, `format` (`reporting-api` or
`report-uri`), `document`, `directive`, `blocked`, `source`, `line`, `disposition`. Related events:
`csp.report.empty` and `csp.report.rate_limited`.

### Privacy by design

Never logged: IP addresses, cookies, request bodies, query strings, or full referrer URLs (only
the origin). User agents are truncated to 160 characters. All strings are stripped of control
characters and length-capped, so log injection is not possible. The [privacy page](../public/privacy.html)
describes this to visitors.

## Reading logs

**Dashboard:** Workers & Pages → *portfolio project* → Deployments → the production deployment →
View details → **Functions** → Real-time logs → Begin log stream.

**CLI** (needs a one-time `npx wrangler login`):

```bash
npx wrangler pages deployment tail --project-name <project> --format json
```

Useful filters with `jq`:

```bash
# Errors and fallbacks only
… | jq -c 'select(.level == "error" or .outcome == "fallback")'

# One request, end to end (paste the X-Request-Id from the response)
… | jq -c 'select(.trace_id == "<id>" or .page_trace_id == "<id>")'

# CSP violations grouped by directive and blocked origin
… | jq -r 'select(.event == "csp.violation") | "\(.directive)\t\(.blocked)"' | sort | uniq -c | sort -rn

# Slow requests
… | jq -c 'select(.event == "request" and .duration_ms > 500)'
```

To trace a request yourself, send your own `traceparent` header and look for that ID:

```bash
curl -sI https://jayantgoswami.com/ -H 'traceparent: 00-0123456789abcdef0123456789abcdef-0123456789abcdef-01' \
  | grep -i -E 'x-request-id|server-timing'
```

## Interpreting CSP reports

Most violations are noise from the visitor's own browser, not from the site. Common sources:

| `source` / `blocked` | Likely cause | Action |
|---|---|---|
| `chrome-extension:`, `moz-extension:`, `safari-web-extension:` | Browser extensions injecting code | Ignore |
| `inline` from `/cdn-cgi/…` | Cloudflare Bot Fight Mode's JavaScript Detections | Expected; ignore |
| `https://jayantgoswami.com/assets/…` with `require-trusted-types-for` | A code change wrote to a DOM sink such as `innerHTML` | **Fix the code** |
| An unknown external origin on many different visitors | Possible injection or a compromised asset | **Investigate now**; see [OPERATIONS.md](OPERATIONS.md#incident-runbooks) |

## Retention

Pages Functions logs are **live only and not stored**. The stream also pauses above about
100 requests/s and allows at most 10 concurrent viewers. That's fine for this site's traffic and
privacy goals. If historical logs are needed:

- **Workers Paid + Logpush:** push Functions trace events to R2 or a log platform.
- **Tail Worker:** add a Tail Worker that forwards these JSON lines to a log store.

Either option is additive: the log format above is already shaped for ingestion, with one JSON
object per line, ISO timestamps and stable field names.

Cloudflare's own dashboards cover the CDN layer without any code: **Analytics & Logs → Web
Analytics / Traffic** for volume, cache ratio and status codes, and **Security → Events** for WAF
and bot actions (searchable by Ray ID).
