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

[Unreleased]: https://github.com/jayant4202/portfolio/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/jayant4202/portfolio/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/jayant4202/portfolio/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jayant4202/portfolio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jayant4202/portfolio/releases/tag/v1.0.0
