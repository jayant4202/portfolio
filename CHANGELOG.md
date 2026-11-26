# Changelog

All notable changes to jayantgoswami.com. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/) adapted for a website:

- **MAJOR:** a redesign, a new platform, or anything that changes URLs visitors or search engines rely on.
- **MINOR:** new pages, sections, features, prototypes or security/observability capabilities.
- **PATCH:** content edits, fixes, copy changes, dependency or configuration tweaks.

Every release is tagged in git as `vX.Y.Z` on the commit that was deployed. To tag in GitHub Desktop:
**History → right-click the commit → Create Tag…**, then **Push origin**. Rollback steps are in
[docs/OPERATIONS.md](docs/OPERATIONS.md#rollback).

Add new entries under **Unreleased** as you work; rename the heading to a version and date when you
deploy.

## [Unreleased]

## [1.4.0] - 2026-11-26

Profile icons, PII protection, speed and image loading, and bug fixes.

### Added
- **GitHub and LinkedIn icons in the top-right corner of every page.** They open the profiles in a
  new tab (`rel="me noopener noreferrer"`) and replace only the header's "LinkedIn ↗" button. Every
  other LinkedIn button and link (home CTA, About, footer, mobile menu) is unchanged. They are
  visible at every width down to 320 px: on very narrow phones the name text hides and the photo stays.
  GitHub was also added to the build's outbound-link allow-list and to the structured data (`sameAs`).
- **PII protection layer (`lib/edge/pii.js`):**
  - Redaction of emails, phone numbers and IPs, applied to every log line.
  - HMAC pseudonymisation; the report endpoint's rate limiter no longer holds raw IPs, even in memory.
  - AES-256-GCM encryption with purpose binding and key rotation, ready for any stored PII (roadmap
    v2.0). It is configured through a Cloudflare secret, never the repo, and fails closed.
  - 40 new unit tests.
- PII inventory and key-management runbook in SECURITY.md.
- `/version.json` (the deployed commit). The post-deploy smoke test now waits for the pushed commit to
  be live before testing.
- `npm run images` (`scripts/optimize-images.mjs`, sharp): generates every photo size and format from
  one master.
- New tests:
  - header icons on every page and at every width
  - other LinkedIn links untouched
  - modern image formats served, hidden photos not downloaded
  - video not downloaded until played
  - cache headers
  - `version.json`
- Build gate: every `srcset` image and video `poster` must exist and be fingerprinted.
- `docs/SETUP.md`: step-by-step Mac setup guide (with links) for development, testing, automation and
  maintenance, covering account security, update cadence and troubleshooting.
- `.githooks/pre-commit`: blocks commits that contain secrets (gitleaks) or fail the release gate.
  Works from GitHub Desktop. Enable with `git config core.hooksPath .githooks`.
- Google Search Console ownership file `/google8b0f2db1d47e57ef.html`. The middleware serves Google
  verification files directly with a 200, bypassing Pages' `.html` → extensionless 308 redirect, which
  verifiers can reject. Covered by unit and end-to-end tests; excluded from page tests and HTML lint.

### Changed (speed and image loading)
- **Photos are served as AVIF and WebP with JPEG fallback,** via `<picture>`. The About photo drops
  from 91 KB to 19 KB, and the header avatar from 6.7 KB to 2.5 KB.
- **The About page no longer downloads images it hides:**
  - Phones get a 1-pixel placeholder instead of the large photo.
  - The small mobile avatar is lazy-loaded at 160 px instead of a 360 px photo.
- **Link-preview image: 667 KB PNG → 30 KB JPEG,** with `og:image` width, height and alt text.
- **Demo video:**
  - It now downloads only when played (`preload="none"`), with an 11 KB poster frame.
  - Fixed width, height and aspect ratio prevent layout shift.
- **Fingerprinted CSS, JS and images are cached for a year** (`immutable`). Video and PDFs stay at
  one day.
- Result: every page weighs 21–32 KB on first load, and Lighthouse is 100/100/100/100 on all
  tested pages (Demos performance 99 → 100).

### Fixed
- **Cloudflare Web Analytics still recorded nothing.** The beacon loaded but posts to `/cdn-cgi/rum`
  on the site itself, which `connect-src` blocked. Added `'self'` to `connect-src`.
- **The post-deploy smoke test never ran:** Cloudflare Pages doesn't emit GitHub `deployment_status`
  events. It now triggers on push and waits for the commit to go live.
- **Smoke-test failures on GitHub were unreadable without signing in.** Each failed check is now a
  public annotation, and a Cloudflare bot challenge is detected and explained in one message.
- GitHub Actions updated to v7 (checkout, setup-node, upload-artifact). This removes the Node 20
  deprecation warnings and supersedes Dependabot PRs #1–#3.
- PII redaction patterns: phone numbers ending a sentence and `::`-compressed IPv6 addresses are now
  caught, and clock times are no longer mistaken for IPv6 (found by the new tests).

## [1.3.0] - 2026-11-24

Testing and automation foundation (roadmap v1.3).

### Added
- **Automated test suite** (`npm run check`), documented in `docs/TESTING.md`:
  - 70 Vitest unit tests for the edge middleware, report endpoint and helpers. A mutation check
    confirmed that planted bugs fail the suite.
  - 143 Playwright end-to-end tests on `wrangler pages dev`, which applies the real headers and
    Functions. They cover Chromium, Firefox, WebKit, Pixel 7 and iPhone 14: every page, theme picker,
    filters, mobile menu, media fallbacks, no-JS mode, server security and the report endpoint.
  - axe-core accessibility scan of every page: 0 serious or critical issues.
  - html-validate (standards + a11y), ShellCheck, and Lighthouse CI budgets. Baseline is
    100/100/100/100.
- `scripts/smoke.sh`: 44 checks against the live site.
- **GitHub Actions:**
  - `ci.yml`: build gate, ShellCheck, gitleaks, Semgrep, unit, HTML, end-to-end, Lighthouse.
  - `smoke.yml`: after each production deploy, plus daily.
  - Dependabot: weekly.
- `package.json` (dev tooling only), `package-lock.json`, `.nvmrc`.

### Changed
- `robots.txt`: removed the non-standard `Content-Signal` line, which failed robots.txt validators
  (Lighthouse SEO 92 → 100). The AI-training opt-out is unchanged: per-crawler `Disallow` rules,
  plus Cloudflare's edge policy.
- Removed redundant `aria-label` attributes from result lists (flagged by html-validate).
- `build.sh` and `smoke.sh` are now ShellCheck-clean.
- The local dev server runs over HTTPS, so Safari-engine tests use the exact production CSP.

### Deploy notes
- Set `SKIP_DEPENDENCY_INSTALL=1` in Cloudflare Pages. The build doesn't need the new dev tools.
- Optional: protect `main` with required CI checks (docs/TESTING.md → "Making CI a real gate").

## [1.2.1] - 2026-11-24

Security sanity pass on the live site.

### Fixed
- **Stale security headers on cached files.** Cloudflare's cache keeps the headers a file was first
  cached with. Files whose content never changed (the demo video, images) were still serving headers
  from the first deployment. Asset fingerprints now cover both the file and `public/_headers`, so any
  header change gives every asset a new URL. The video, resume and assignment PDFs are now
  fingerprinted too. The build fails if any asset link lacks a fingerprint.
- **Cloudflare Web Analytics was silently blocked** by the Content-Security-Policy, so no visits were
  recorded. The CSP now allows exactly `static.cloudflareinsights.com` (script) and
  `cloudflareinsights.com` (beacon). The privacy page describes the cookieless analytics.
- `/security.txt` now redirects to `/.well-known/security.txt` (RFC 9116 legacy location).

### Changed
- CSP reports are classified by likely origin (`browser-extension`, `cloudflare-bot-detection`,
  `unknown`). Expected noise is logged at `info`, so only `unknown` violations appear as warnings.
  `'report-sample'` was added to `script-src` to make classification possible.

### Verified (live)
- All 12 security headers are present on every page, redirect, 404 and API response.
- HTTP redirects to HTTPS. TLS 1.0 and 1.1 are refused; TLS 1.3 is negotiated. The certificate is
  from Google Trust Services, valid until Feb 2027.
- No open redirects, path traversal, reflected input, source-file exposure, cookies or
  `X-Powered-By` leaks. Non-GET methods return 405. The report endpoint rejects wrong types, oversized
  bodies and bad JSON, and echoes nothing.
- Pages are cross-origin isolated (`crossOriginIsolated === true`), Trusted Types are enforced, and
  the demo video plays under COEP.

### Known / pending (Cloudflare dashboard)
- `www.jayantgoswami.com` has no DNS record yet.
- DNSSEC, CAA and email anti-spoofing records are not set (see docs/OPERATIONS.md).

## [1.2.0] - 2026-11-22

### Added
- Theme picker: **Dark (default)**, Light, System. Dark applies even without JavaScript.
- Edge middleware (`functions/_middleware.js`): W3C trace context per request, `X-Request-Id`,
  `Server-Timing`, structured JSON logs, canonical-host 301s (`www`, `*.pages.dev`), `noindex` on
  preview deployments, method allow-list, 10 s origin timeout, and a fail-open fallback.
- `POST /api/report`: CSP violation reports linked to the originating page's trace ID, with size,
  type and rate limits.
- Subresource Integrity (SHA-384) on every script and stylesheet.
- `robots.txt` AI policy: search and answer engines allowed, AI training crawlers disallowed,
  `Content-Signal` header.
- Engineering docs: `docs/ARCHITECTURE.md`, `docs/OBSERVABILITY.md`, `docs/OPERATIONS.md`,
  `SECURITY.md`.

### Changed
- CSP hardened: Trusted Types, `worker-src 'none'`, `manifest-src 'self'`, reporting.
- New headers: `Cross-Origin-Embedder-Policy: require-corp`, an expanded `Permissions-Policy`, and
  `Reporting-Endpoints`.
- The build gate now checks parity between `_headers` and the edge header baseline, SRI presence,
  `_routes.json` validity, and the absence of outbound `fetch` in edge code.

### Fixed
- Canonical URLs, sitemap and `security.txt` pointed to an unreachable `*.pages.dev` host
  (`SITE_URL` misconfigured). The build now warns about this.

## [1.1.0] - 2026-11-21

### Added
- Profile photo as the site logo, with an initials fallback.
- Result chips with ▲/▼ trend arrows (green = good, red = bad) on every card and case study.
- Animated background: problems → AI → products.
- CampaignCrafter case study, with a problem / solution / impact summary on Demos.
- About page: Education, Resume and Skills tiles.
- `/.well-known/security.txt`.
- Content-fingerprinted asset URLs (cache-busting).
- Tag-balance check in the build.

### Changed
- Generic, product-focused intro. Tighter spacing. Title Case for tags.
- Work filters show only the selected category.

### Removed
- The live AI demo (spend categoriser) and its API.

## [1.0.0] - 2026-11-20

### Added
- Initial launch on Cloudflare Pages at jayantgoswami.com: home, work, demos, about, privacy, 404.
- 5 case studies, 6 assignments and research pieces, the CampaignCrafter demo video, resume
  download and LinkedIn link.
- Strict CSP and security headers, plus a build-time gate covering link allow-list, PDF safety,
  internal links, inline code and file-size limits.

[Unreleased]: https://github.com/jayant4202/portfolio/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/jayant4202/portfolio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jayant4202/portfolio/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/jayant4202/portfolio/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/jayant4202/portfolio/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jayant4202/portfolio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jayant4202/portfolio/releases/tag/v1.0.0
