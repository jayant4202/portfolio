# Testing and automation

Every change goes through five layers of automated checks. They run locally with one command, and
on GitHub for every push and pull request.

| Layer | Tool | What it proves | Command |
|---|---|---|---|
| Release gate | `build.sh` | Links, SRI, PDF safety, header parity, no secrets or inline code (see README) | `npm run build` |
| Unit | Vitest | Edge middleware and report endpoint: tracing, redirects, 405s, fallbacks, timeouts, sanitisation, rate limits (70 tests) | `npm run test:unit` |
| End-to-end | Playwright on `wrangler pages dev` | Every page in Chromium, Firefox, WebKit, Android and iPhone sizes: no CSP violations or console errors, no overflow, images load, theme, filters, menu, media fallbacks, no-JS mode | `npm run test:e2e` |
| Accessibility | axe-core (in Playwright) | No serious or critical WCAG 2.1 AA violations on any page | part of `test:e2e` |
| Server security | Playwright request API | All security headers, trace IDs, 405s, `/security.txt` redirect, report-endpoint abuse handling, private files not served, robots policy | part of `test:e2e` |
| Markup | html-validate | Standards-conformant HTML with a11y rules | `npm run lint:html` |
| Performance / SEO | Lighthouse CI | Accessibility ≥ 95 and SEO ≥ 95 (errors); performance and best practices ≥ 90 (warnings) | `npm run lighthouse` |
| Scripts | ShellCheck | `build.sh` and `scripts/*.sh` are clean | `npm run lint:sh` |
| Secrets | gitleaks (CI) | No credentials anywhere in git history | CI only |
| Code security | Semgrep (CI) | No high-severity patterns in edge or browser JS | CI only |
| Production | `scripts/smoke.sh` | 44 live checks: headers, TLS, redirects, private files, certificate and security.txt expiry | `npm run smoke` |

Current baseline (2026-11-24): 70/70 unit, 143/143 end-to-end (107 intentionally skipped
duplicates), HTML valid, Lighthouse 100/100/100/100, smoke 44/44, `npm audit` 0 vulnerabilities.

## Setup on a Mac

The full step-by-step guide, with links, is [SETUP.md](SETUP.md). The short version:

```bash
xcode-select --install          # git and compilers
# Install Homebrew from https://brew.sh, then:
brew install node shellcheck gitleaks gh
cd portfolio
npm ci                          # dev tools from package-lock.json
npx playwright install          # test browsers (~400 MB, cached in ~/Library/Caches/ms-playwright)
```

## Everyday commands

```bash
npm run dev           # site at https://localhost:8788 exactly as Cloudflare serves it (accept the local certificate)
npm test              # unit + end-to-end
npm run check         # lint + all tests (run before every push)
npm run test:e2e:ui   # Playwright's visual runner: watch tests, time-travel through failures
npm run lighthouse    # performance/SEO report in .lighthouseci/
npm run smoke         # check the live site
```

A failed Playwright run leaves screenshots and a trace per failure in `test-results/`. Open one with
`npx playwright show-trace test-results/<test>/trace.zip`, or browse the HTML report with
`npx playwright show-report`.

## Why the local server uses HTTPS

The production CSP includes `upgrade-insecure-requests`. WebKit (Safari's engine) applies it even
to `http://localhost`, so on a plain-HTTP server every asset would fail in Safari-engine tests. The
local server runs over HTTPS with a self-signed certificate, so tests use the exact production
policy.

## Known test-environment limits

- **Playwright's WebKit can't play H.264 MP4.** The "video plays" test is skipped on WebKit projects;
  real Safari is unaffected. The broken-video fallback test still runs everywhere.
- **The local emulator differs from Cloudflare** for `/_headers` (502 locally) and `/_routes.json`
  (served locally). Production returns 404 for both, which `smoke.sh` checks against the live site.
- **No visual-regression screenshots yet.** Font rendering differs between macOS and the Linux CI
  runners, so baselines would need generating in CI. Add them when the design stabilises.

## Continuous integration (`.github/workflows/`)

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | Every push to `main`, every pull request, manual | Build gate + ShellCheck + gitleaks · Semgrep · Unit · HTML · End-to-end · Lighthouse |
| `smoke.yml` | After each successful production deploy, daily at 08:47 IST, manual | `scripts/smoke.sh` against jayantgoswami.com |
| `dependabot.yml` | Weekly | Grouped update PRs for dev tools and Actions; CI must pass before merging |

Reports (Playwright HTML, Lighthouse) are attached to each run as downloadable artifacts.

### Making CI a real gate

Cloudflare Pages deploys `main` on its own, independently of GitHub Actions. For tests to block a
bad release:

1. Work on a branch and open a pull request. In GitHub Desktop: **Branch → New branch**, commit,
   **Publish branch**, then **Create Pull Request**. Cloudflare builds a preview URL for the branch.
2. On GitHub: **Settings → Branches → Add branch ruleset** for `main`. Turn on **Require status
   checks to pass** and select the CI jobs.
3. Merge only when CI is green. The merge deploys to production, and `smoke.yml` then verifies the
   live site.

## Adding tests for new work

- **New page:** nothing to do. `pages.spec.js` discovers every page in `dist/` and runs the full
  page checks and accessibility scan on it.
- **New interactive feature:** add a `test.describe` block to `tests/e2e/features.spec.js`.
- **New edge endpoint (for example, prototype trials):** add `tests/unit/<name>.test.js` with mocked
  `context` objects, following `report.test.js`, plus request-level checks in `security.spec.js`.
- **New security header:** add it to both header files (the build checks parity). The unit and
  e2e tests pick it up from `public/_headers` automatically.
