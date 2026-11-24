# Product roadmap and feature register

The living reference for **what the site does today** and **where it's going**. Update it in the
same commit as any change it describes. Version history lives in [CHANGELOG.md](../CHANGELOG.md).

_Last reviewed: 2026-11-24 · Current version: 1.2.1_

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

### Next: testing and automation foundation (v1.3)

Goal: every push is tested automatically before Cloudflare deploys it.

| Item | Tool | Done when |
|---|---|---|
| Local dev with real headers + Functions | `wrangler pages dev` | `npm run dev` serves the site exactly as production does |
| Unit tests for edge code | Vitest + `@cloudflare/vitest-pool-workers` | The middleware and report scenarios run in CI |
| End-to-end and visual tests across browsers and viewports | Playwright | Theme, filters, nav, media, every page × 5 widths |
| Accessibility | `@axe-core/playwright` | Zero serious/critical violations |
| Performance / SEO budgets | Lighthouse CI | ≥ 95 performance, 100 accessibility/SEO/best practices |
| HTML and link validation | html-validate, lychee | No invalid markup or dead links |
| Secret and code scanning | gitleaks (pre-commit + CI), Semgrep, ShellCheck | Zero findings |
| CI pipeline | GitHub Actions | All of the above on every pull request; required before merge |
| Post-deploy smoke test | GitHub Actions + curl | Headers, TLS and key pages checked against production after each deploy |

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
| 2026-11-24 | Keep Bot Fight Mode's inline JS check blocked | Allowing it would need nonces plus a Trusted Types exception; Bot Fight Mode works without it |
