# jayantgoswami.com

Source for [jayantgoswami.com](https://jayantgoswami.com), the portfolio of Jayant Goswami, product manager.

The site is static HTML, CSS and vanilla JavaScript, served from Cloudflare Pages. A thin edge
middleware adds request tracing and keeps security headers in place. It has no framework, no npm
dependencies, no cookies and no secrets; the only third-party script is Cloudflare's cookieless Web Analytics. Every design choice favours a small
attack surface and a build that fails before anything unsafe can ship.

| | |
|---|---|
| **Hosting** | Cloudflare Pages (static assets + Pages Functions middleware) |
| **Build** | `bash build.sh`, a single dependency-free script that also acts as the release gate |
| **Runtime JS** | ~200 lines, progressive enhancement only; the site works fully without it |
| **Security** | Strict CSP with Trusted Types, SRI, HSTS, COOP/COEP/CORP, an allow-listed outbound-link policy |
| **Observability** | W3C trace IDs per request, structured JSON logs, CSP violation reports linked to traces |

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, request lifecycle, design decisions and trade-offs |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability, threat model, every control and why it exists |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Trace model, log schema, how to read logs, correlating browser reports |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Deploy, rollback, Cloudflare configuration, recurring tasks, incident runbooks |
| [docs/SETUP.md](docs/SETUP.md) | **Start here:** step-by-step Mac setup for development, testing, automation and maintenance, with links |
| [docs/TESTING.md](docs/TESTING.md) | Test layers, Mac setup, everyday commands, CI pipelines, adding tests |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Feature register, content inventory, roadmap (testing automation, hosted prototypes with trials), decision log |
| [CHANGELOG.md](CHANGELOG.md) | Versioned release history; every deploy is tagged `vX.Y.Z` |

## Repository layout

```
public/                     Everything served to visitors (copied to dist/ by the build)
  *.html                    Top-level pages: home, work, demos, about, privacy, 404
  case-studies/             One page per case study (_template.html is the starting point)
  assignments/              One page per assignment; source PDFs live in assets/docs/
  assets/css/style.css      Single stylesheet; design tokens at the top, theme rules below
  assets/js/theme.js        Applies the saved theme before first paint (render-blocking by design)
  assets/js/main.js         All other behaviour; each feature isolated in its own error boundary
  assets/img|video|docs/    Media and downloadable documents
  _headers                  Security and caching headers for static responses
  _routes.json              Which paths run through Functions (static assets bypass them)
  robots.txt, sitemap.xml   Crawler policy, including AI-training opt-out
  .well-known/security.txt  RFC 9116 security contact
functions/
  _middleware.js            Edge middleware: tracing, header baseline, host canonicalisation, fail-open
  api/report.js             POST /api/report: receives CSP violation reports
lib/edge/                   Shared edge modules (kept outside functions/ so they never become routes)
  security-headers.js       Header baseline, which must match public/_headers (build-enforced)
  trace.js                  Trace context, sanitisation helpers, structured logger
build.sh                    Build + release gate (see below)
.githooks/pre-commit        Blocks commits containing secrets or failing the release gate
scripts/smoke.sh            Live-site smoke test (run after every deploy and daily by CI)
tests/unit/                 Vitest unit tests for the edge code
tests/e2e/                  Playwright end-to-end, accessibility and server-security tests
.github/                    CI, post-deploy smoke test, Dependabot
package.json                Dev tooling only (tests, linters, local server); nothing ships to visitors
docs/                       Engineering documentation
```

## Local development

Requirements: Node.js 22 (`.nvmrc`), plus bash and openssl. Step-by-step setup: [docs/SETUP.md](docs/SETUP.md).

```bash
npm ci && npx playwright install   # once
npm run dev                        # https://localhost:8788, served exactly as Cloudflare does
npm run check                      # lint + unit + end-to-end tests; run before every push
```

`npm run dev` uses `wrangler pages dev`, so `_headers`, `_routes.json` and the edge middleware all
apply locally. The site itself still has zero runtime dependencies: `build.sh` needs only bash and
openssl.

## The build is the release gate

`build.sh` copies `public/` to `dist/`, injects the real domain, and fingerprints every asset reference
(CSS, JS, images, video, PDFs) with a hash of the file *and* of `_headers`, so header changes reach
Cloudflare-cached files too. It adds Subresource Integrity hashes to every stylesheet and
script. It then **refuses to produce output** if any of these checks fail:

| Check | Prevents |
|---|---|
| `SITE_URL` is a valid https origin (warns if it's a `*.pages.dev` address) | Canonical URLs and the sitemap pointing at the wrong host |
| Every outbound URL is on the allow-list | Links or redirects to unexpected sites |
| No `javascript:`/`data:` links, meta refresh, inline styles or handlers | Script injection, CSP breakage |
| `target="_blank"` always has `rel="noopener"` | Reverse tabnabbing |
| Structural tags are balanced on every page | Silent layout breakage |
| Every internal link and asset exists | 404s |
| Every stylesheet and script carries an SRI hash | Running tampered assets |
| PDFs are real PDFs with no JavaScript, launch actions, embedded files or unsafe links | Malicious downloads |
| Edge header baseline matches `_headers` exactly | Pages served without protections via Functions |
| `_routes.json` is valid; edge code makes no outbound `fetch` | Cost blow-ups, data exfiltration |
| No file over 25 MB; no `.env`, keys, scripts or Markdown in the output | Deploy failures, secret leaks |

A failed build deploys nothing, so the last good version stays live.

## Making changes

- **Content:** edit the HTML in `public/`. To add a case study, copy `case-studies/_template.html`,
  add a card to `work.html` (and update the filter counts), and add the URL to `sitemap.xml`.
  `<!-- ADD: ... -->` comments mark details still to be filled in.
- **Resume / photo:** replace the file under `public/assets/` and keep the same name; cache
  fingerprints update automatically.
- **Result chips:** the class sets the meaning, not the arrow. Green means good, red means bad:
  `kpi good up`, `kpi good down` (a reduction that's good, such as time saved), `kpi bad up|down`,
  `kpi neutral`. Always include the visually hidden text for screen readers:

  ```html
  <span class="kpi good down"><span class="kpi-arrow" aria-hidden="true">▼</span>30%<span class="visually-hidden"> decrease (an improvement)</span></span>
  ```
- **Copy style:** Title Case for tags and skills ("API Integrations"); sentence case for headings
  and buttons.
- **Headers:** change `public/_headers` and `lib/edge/security-headers.js` together. The build
  fails if they differ.
- **New outbound link:** add it to `ALLOWED_EXTERNAL` in `build.sh` deliberately; the build rejects
  anything else.

Record every change under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) and keep
[docs/ROADMAP.md](docs/ROADMAP.md) in step.

Deploys: push to `main`, and Cloudflare Pages builds and publishes in about a minute. See
[docs/OPERATIONS.md](docs/OPERATIONS.md) for settings, rollback and recurring maintenance.
