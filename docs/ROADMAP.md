# Product roadmap and feature register

The living reference for **what the site does today** and **where it's going**. Update it in the
same commit as any change it describes. Version history lives in [CHANGELOG.md](../CHANGELOG.md).

_Last reviewed: 2026-11-26 · Current version: 1.4.1_

## 1. Feature register (what's live)

Status: ✅ live · 🧪 in progress · 💤 parked · ❌ removed

| Area | Feature | Status | Since | Where |
|---|---|---|---|---|
| Content | Home: intro, KPIs, featured work, recent assignments | ✅ | 1.0.0 | `public/index.html` |
| Content | Work: case studies and assignments with filters | ✅ | 1.0.0 | `public/work.html` |
| Content | Demos: CampaignCrafter video + summary | ✅ | 1.0.0 | `public/demos.html` |
| Content | About: bio, experience timeline, education, skills, resume, hobbies | ✅ | 1.0.0 | `public/about.html` |
| UX | Theme picker (Dark default / Light / System) | ✅ | 1.2.0 | `theme.js`, `main.js` |
| UX | Result chips with trend arrows | ✅ | 1.1.0 | `style.css` (`.kpi`) |
| UX | Animated background | ✅ | 1.1.0 | `assets/img/ai-flow.svg` |
| UX | Media and photo fallbacks; works without JS | ✅ | 1.0.0 | `main.js` |
| Security | Strict CSP + Trusted Types, SRI, HSTS, COOP/COEP/CORP | ✅ | 1.2.0 | `_headers`, `lib/edge/` |
| Security | Build-time release gate | ✅ | 1.0.0 | `build.sh` |
| Security | security.txt, AI crawler policy | ✅ | 1.1.0 / 1.2.0 | `.well-known/`, `robots.txt` |
| Ops | Request tracing + structured logs | ✅ | 1.2.0 | `functions/_middleware.js` |
| Ops | CSP violation reporting | ✅ | 1.2.0 | `functions/api/report.js` |
| Ops | Cloudflare Web Analytics (cookieless) | ✅ | 1.2.1 | Cloudflare dashboard |
| Quality | Unit tests for edge code (Vitest) | ✅ | 1.3.0 | `tests/unit/` |
| Quality | Cross-browser end-to-end, accessibility and server-security tests (Playwright + axe) | ✅ | 1.3.0 | `tests/e2e/` |
| Quality | HTML validation, ShellCheck, Lighthouse budgets | ✅ | 1.3.0 | `package.json` scripts |
| Quality | CI on every push; post-deploy and daily smoke tests; Dependabot | ✅ | 1.3.0 | `.github/` |
| Quality | Pre-commit hook: secret scan + release gate | ✅ | 1.4.0 | `.githooks/pre-commit` |
| Docs | Mac setup guide | ✅ | 1.4.0 | `docs/SETUP.md` |
| SEO | Google Search Console verification | ✅ | 1.4.0 | `public/google8b0f2db1d47e57ef.html` |
| UX | GitHub + LinkedIn profile icons, top right | ✅ | 1.4.0 | page headers, `style.css` (`.social-links`) |
| Security | PII layer: log redaction, pseudonymisation, AES-256-GCM encryption | ✅ | 1.4.0 | `lib/edge/pii.js` |
| Performance | AVIF/WebP photos, no hidden-image downloads, lazy video with poster, 1-year asset cache | ✅ | 1.4.0 | `scripts/optimize-images.mjs`, `_headers` |
| Ops | `/version.json` + push-triggered smoke test that waits for the deploy | ✅ | 1.4.0 | `build.sh`, `.github/workflows/smoke.yml` |
| Demo | Live AI spend categoriser | ❌ | 1.0.0–1.1.0 | removed |

### Content inventory

| Type | Item | Page |
|---|---|---|
| Case study | Credit Line on UPI and credit cards | `case-studies/credit-line-on-upi.html` |
| Case study | Change requests as a revenue line | `case-studies/change-request-platform.html` |
| Case study | CampaignCrafter AI agent | `case-studies/campaigncrafter.html` |
| Case study | RAG chatbot | `case-studies/rag-chatbot.html` |
| Highlight | Onboarding redesign | `work.html` (card only) |
| Assignment | KoreFi: Payout Auditor | `assignments/korefi-payout-auditor.html` |
| Assignment | Volopay: Invoice Rail | `assignments/volopay-invoice-rail.html` |
| Assignment | Ola Seat | `assignments/ola-seat.html` |
| Assignment | Kalaari: investment memo | `assignments/kalaari-investment-memo.html` |
| Assignment | AxionRay: AI support ROI | `assignments/axionray-support-ai.html` |
| Research | IFC in least-developed countries | `work.html` (card) |
| Demo | CampaignCrafter video | `demos.html` |

## 2. Roadmap

### Now: content cadence (ongoing)

- Add case studies and assignments as they're completed (template: `case-studies/_template.html`).
- Fill the remaining `<!-- ADD: -->` notes (CampaignCrafter metrics).
- Set up the www DNS record, DNSSEC, CAA and email anti-spoofing records (docs/OPERATIONS.md).

### Done: testing and automation foundation (v1.3.0, 2026-11-24)

All of the items below shipped. See [TESTING.md](TESTING.md). Remaining follow-ups:
- Turn on branch protection so CI blocks merges to `main` (needs the pull-request workflow).
- Add visual-regression screenshots once the design stabilises (baselines generated in CI).

| Item | Tool | Delivered |
|---|---|---|
| Local dev with real headers + Functions | `wrangler pages dev` (HTTPS) | `npm run dev` |
| Unit tests for edge code | Vitest (plain Node; the edge code uses only Web APIs) | 70 tests (114 as of 1.4.0) |
| End-to-end tests across browsers and viewports | Playwright | 143 tests × 5 browser/device projects (160 as of 1.4.0) |
| Accessibility | `@axe-core/playwright` | 0 serious/critical on every page |
| Performance / SEO budgets | Lighthouse CI | 100/100/100/100 baseline |
| HTML and link validation | html-validate; link crawl in Playwright + build gate | Valid on all pages |
| Secret and code scanning | gitleaks, Semgrep (CI); ShellCheck | ShellCheck clean; others run in CI |
| CI pipeline | GitHub Actions | `ci.yml` on every push / PR |
| Post-deploy smoke test | GitHub Actions + `scripts/smoke.sh` | 44 live checks after each deploy and daily |

### Later: hosted prototypes with free trials (v2.0)

Goal: visitors can try prototypes built with Claude Code, with **4–5 free runs**, then a paid tier.

**Architecture (proposed)**
- Each prototype runs as its own **Cloudflare Worker** on a subdomain
  (`<name>.apps.jayantgoswami.com`), isolated from the portfolio. A compromised or expensive
  prototype can't affect the main site, and the portfolio's strict CSP stays intact.
- The portfolio links to prototypes, or embeds them only after relaxing `frame-src` for that exact
  subdomain. Embedding under COEP `require-corp` requires the prototype to send
  `Cross-Origin-Resource-Policy: cross-origin`.
- A shared **gateway Worker** handles identity, trials and billing for all prototypes, so each
  prototype contains only product logic.

**Trial metering**

| Concern | Approach |
|---|---|
| Who is the visitor? | Email magic link (or "Sign in with Google") → signed, HttpOnly, SameSite=Lax session cookie on `apps.` only |
| Bots and abuse | Cloudflare **Turnstile** on sign-up and first run; WAF rate-limiting rules |
| Counting runs | **Durable Object** per user, which gives an atomic counter with no double-spend race. Mirror events to **D1** for reporting |
| Limits | 5 free runs per account; per-IP and per-device soft caps to blunt multi-account farming |
| AI costs | API keys only as Worker **secrets**; a per-run token cap; a daily global spend ceiling that fails closed |
| Model calls | Through **Cloudflare AI Gateway**, for caching, rate limiting, cost analytics and logs |

**Paid tier**
- **Stripe Checkout** (hosted, so no card data touches the site) + webhooks into the gateway Worker,
  verified with the Stripe signing secret. Credit packs or a subscription, mapped to run quotas.
- Indian tax and compliance: GST registration thresholds, invoices, and RBI e-mandate rules for
  recurring charges. Validate before launch.
- Legal pages: Terms of Use, Refund Policy, an updated Privacy Policy (accounts, payments, AI
  providers), and cookie notice for the `apps.` subdomain.

**Security additions for v2.0**
- Secrets only in Worker secrets / `.dev.vars` (already git-ignored); never in the repo.
- Separate Cloudflare API tokens per environment, scoped to the minimum.
- Stripe webhook signature verification; idempotency keys on every charge-affecting write.
- Prompt-injection and output filtering for any prototype that takes user text.
- Per-prototype threat model added to SECURITY.md before launch.
- Persistent logs (Workers Logs / Logpush) once accounts and payments exist, for audit.

**Milestones**

| Version | Scope |
|---|---|
| 2.0 | Gateway Worker, magic-link auth, Turnstile, Durable Object trial counter, first prototype live with 5 free runs |
| 2.1 | Stripe Checkout + webhooks, credit packs, usage page for visitors |
| 2.2 | Prototype catalogue on Demos with live "runs left" badges; AI Gateway cost dashboards |

### Ideas backlog

- A "Now" page or writing section (notes on AI in payments).
- Case-study PDFs generated from the HTML for offline sharing.
- Open Graph images per case study.

## 3. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-20 | Static HTML, no framework | Small content set; zero supply chain; strict CSP |
| 2026-11-21 | Removed the live AI demo | Removed API-key and abuse risk until trials can be metered properly (v2.0) |
| 2026-11-22 | Dark theme default | Brand preference |
| 2026-11-22 | Allow AI search, disallow AI training | Discoverability without donating content to training |
| 2026-11-24 | Allow Cloudflare Web Analytics in CSP | Cookieless visitor stats; Cloudflare is already the trusted host |
| 2026-11-24 | Test locally over HTTPS | WebKit applies `upgrade-insecure-requests` to localhost; HTTPS keeps the test CSP identical to production |
| 2026-11-24 | Drop `Content-Signal` from robots.txt | Non-standard; failed validators. Per-crawler rules + Cloudflare policy already enforce the training opt-out |
| 2026-11-24 | Vitest in plain Node, not the Workers pool | Edge code uses only Web-standard APIs; simpler and faster. Revisit when prototypes use KV/D1/Durable Objects |
| 2026-11-26 | Content-hashed asset filenames instead of `?v=` (v1.4.1) | Pages ignores query strings; with SRI and a long cache, a deploy race left a browser unstyled. Hashed names make each URL immutable by construction |
| 2026-11-26 | Build the PII encryption layer before any PII is stored | Retro-fitting encryption onto stored data is harder and riskier than starting encrypted; v2.0 trial accounts will need it |
| 2026-11-26 | Keep the resume's email/phone public | Owner decision: it is a resume meant for recruiters, so the contact details stay public. Encrypting a public download would be meaningless |
| 2026-11-26 | Allow `'self'` in `connect-src` | Cloudflare Web Analytics posts to `/cdn-cgi/rum` on the site's own origin |
| 2026-11-24 | Keep Bot Fight Mode's inline JS check blocked | Allowing it would need nonces plus a Trusted Types exception; Bot Fight Mode works without it |
