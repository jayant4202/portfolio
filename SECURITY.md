# Security

## Reporting a vulnerability

Please report security issues privately via a direct message on
[LinkedIn](https://www.linkedin.com/in/jayant-goswami/). Do not open a public issue. Expect an
acknowledgement within 3 working days and a fix or a reasoned decision within 14 days. This is a
personal site with no bug bounty, but valid reports are credited on request.

In scope: jayantgoswami.com and this repository. Out of scope: volumetric DoS, findings that need a
compromised device or browser, missing headers on third-party domains, and reports produced only by
automated scanners without a demonstrated impact.

The machine-readable contact is published at `/.well-known/security.txt` (RFC 9116).

## Threat model

The site has no accounts, forms, database, cookies or secrets, so the main risks are about integrity
and reputation, not data theft:

| Threat | Primary controls |
|---|---|
| Script injection / XSS | No inline code; CSP `script-src 'self'`; Trusted Types; no `innerHTML`; build bans inline handlers |
| Tampered or substituted assets | SRI on every script and stylesheet; content-fingerprinted URLs; CORP `same-origin` |
| Clickjacking, framing | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Cross-origin leaks (Spectre-class) | COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, `Origin-Agent-Cluster` |
| Visitors redirected to a malicious site | Build-time outbound-link allow-list; no meta refresh; `form-action 'none'`; `rel="noopener"` enforced |
| Malicious downloads | Build rejects PDFs with JavaScript, launch actions, embedded files, XFA or unsafe link schemes |
| Downgrade / MITM | HSTS (2 years, subdomains); `upgrade-insecure-requests`; Cloudflare-managed TLS |
| Supply-chain compromise | Zero runtime or build dependencies; the only third-party origins allowed are Cloudflare Web Analytics (Cloudflare is already the host) |
| Abuse of the report endpoint | POST only, content-type allow-list, 16 KB cap, 20 reports per request, rate limiting, no storage |
| Secret leakage | No secrets exist; `.env`, key and certificate files are blocked from the output and git-ignored |
| Bots, scrapers, AI training crawlers | Cloudflare Bot Fight Mode, AI Labyrinth, AI crawler policy, `robots.txt` opt-out |
| Domain / email spoofing | DNSSEC, CAA, SPF/DMARC/null MX (see [docs/OPERATIONS.md](docs/OPERATIONS.md#cloudflare-configuration)) |

## Controls in detail

### Response headers

Defined in `public/_headers` for static responses, and mirrored in `lib/edge/security-headers.js`
for responses that pass through Pages Functions. Cloudflare does not apply `_headers` to Functions
responses, so the middleware adds any missing header. The build fails if the two copies differ.

| Header | Value (abridged) | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`; no inline script or style; scripts only from the site and `static.cloudflareinsights.com`; analytics beacons only to the site itself (`/cdn-cgi/rum`) and `cloudflareinsights.com`; `frame-src`, `worker-src`, `object-src`, `form-action` are `'none'`; `require-trusted-types-for 'script'`; `trusted-types 'none'` | Only the site's own files can run or load; DOM XSS sinks are locked |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Forces HTTPS for 2 years |
| `Cross-Origin-Opener-Policy` / `-Embedder-Policy` / `-Resource-Policy` | `same-origin` / `require-corp` / `same-origin` | Cross-origin isolation |
| `Permissions-Policy` | Every powerful feature disabled except fullscreen and autoplay for the site itself | Least privilege |
| `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies`, `Origin-Agent-Cluster` | Standard hardening | Defence in depth for older browsers |
| `Reporting-Endpoints` + CSP `report-to` / `report-uri` | `/api/report` | Browsers report CSP violations, tagged with the page's trace ID |

PDFs under `/assets/docs/` and the resume drop the page CSP so the browser's built-in PDF viewer
works. The resume is served with `Content-Disposition: attachment`.

**Cached assets and header changes:** Cloudflare caches assets with the headers they had when first
cached. The build therefore includes `_headers` in every asset fingerprint, so changing a header
changes every asset URL and no stale headers survive a deploy.

HSTS `preload` is intentionally not set. Preload-list inclusion is hard to reverse and commits
every future subdomain to HTTPS. Revisit once the domain setup is final.

### Edge code

`functions/_middleware.js` and `functions/api/report.js` hold no secrets, make no outbound network
calls (build-enforced), and log no IP addresses, query strings or bodies. The middleware fails open:
if anything inside it errors, the visitor is served straight from the asset store. Static assets
(`/assets/*`) bypass Functions entirely via `_routes.json`.

### Personal data (PII)

**Inventory (reviewed 2026-11-26):**

| Where | Personal data | Status |
|---|---|---|
| Pages, scripts, edge code, docs | Name, job history, LinkedIn and GitHub URLs (all public by design) | No email, phone or address anywhere in source |
| `public/assets/Jayant-Goswami-Resume.pdf` | Personal email and phone number | Public by design, kept public by the owner (decision 2026-11-26): it is a resume for recruiters |
| Assignment PDFs | None found | Scanned during the 1.4.0 review |
| Git history (all commits) | Commit author is GitHub's private `noreply` address | No spreadsheets, keys or env files ever committed |
| Request logs | None: no IPs, cookies, bodies or query strings | Plus automatic redaction (below) |
| Rate limiter (`/api/report`) | Visitor IP, used only as a counter key | IP is replaced by an HMAC pseudonym before use; raw IP never stored, even in memory |

**Protection layer: `lib/edge/pii.js`.**

| Tool | Guarantee | Used for |
|---|---|---|
| `redactPII` / `redactDeep` | Strips emails, phone numbers and IPv4/IPv6 addresses from text | Every log line (applied inside `log()`), as a last line of defence |
| `pseudonymize` | One-way HMAC-SHA-256 with a random per-isolate key; not reversible, not linkable across isolates | Rate-limit keys |
| `encryptPII` / `decryptPII` | AES-256-GCM authenticated encryption, random 96-bit IV per value, purpose-bound (associated data), versioned tokens `pii.v1.<kid>.<iv>.<ct>`, multi-key rotation, fails closed | **Required for any PII that is stored**, starting with trial accounts in roadmap v2.0 |

The site stores no PII today, so no encryption key is configured yet. When a feature first needs
to store personal data:

1. Generate a key: `openssl rand -base64 32`
2. Store it as an encrypted Cloudflare secret, never in the repo:
   `npx wrangler pages secret put PII_KEYRING` with the value `{"current":"k1","keys":{"k1":"<key>"}}`
3. In code: `const kr = await loadKeyring(env); const token = await encryptPII(email, kr, "trial:email");`
   Store only `token`. To look records up by email, store `pseudonymize(email, <a separate HMAC key>)`
   alongside it.
4. **Rotate yearly or after any suspected exposure:** add `k2`, set `"current":"k2"`, redeploy.
   Old values stay readable. Re-encrypt them, then remove `k1`.

### Build-time gate

See the table in the [README](README.md#the-build-is-the-release-gate). Every rule there is a
security control: a change that violates one cannot be deployed.

## Cloudflare account settings

These live in the Cloudflare dashboard, not in this repository. The checklist and click paths are
in [docs/OPERATIONS.md](docs/OPERATIONS.md#cloudflare-configuration). In short:

- **Bot Fight Mode:** on. JavaScript Detections injects an inline script, which this CSP blocks by
  design. Expect occasional `script-src-elem` reports from `/cdn-cgi/`. Bot Fight Mode still works
  without it.
- **AI Labyrinth:** on. **AI Crawler policy:** Search and Agents allowed; Training disallowed and
  blocked.
- **SSL/TLS:** Always Use HTTPS, minimum TLS 1.2, TLS 1.3 on.
- **DNS:** DNSSEC on, CAA records, and email anti-spoofing records.
- **Accounts:** hardware-key or app-based 2FA on Cloudflare, GitHub and the registrar.
