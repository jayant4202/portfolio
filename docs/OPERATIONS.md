# Operations

## Deploy

Push to `main`. Cloudflare Pages runs `bash build.sh` and publishes `dist/` along with
`functions/`. A failed build publishes nothing.

| Pages setting | Value |
|---|---|
| Build command | `bash build.sh` |
| Build output directory | `dist` |
| Root directory | *(repository root)* |
| Environment variable (Production) | `SITE_URL` = `https://jayantgoswami.com` (no trailing slash) |
| Settings → Runtime → Fail open / closed | **Fail open** (static pages keep serving if the Functions quota is ever exhausted) |
| Custom domains | `jayantgoswami.com` and `www.jayantgoswami.com` (the middleware 301s `www` to the apex) |

`SITE_URL` drives canonical URLs, the sitemap, Open Graph tags, `security.txt` and the host redirect.
The build warns if it's a `*.pages.dev` address. After changing it, trigger a redeploy
(Deployments → latest → Retry deployment).

### Verify a deploy

```bash
curl -sI https://jayantgoswami.com/ | grep -iE 'content-security|strict-transport|x-request-id|server-timing'
curl -s  https://jayantgoswami.com/.well-known/security.txt
curl -s  https://jayantgoswami.com/ | grep -o '<link rel="canonical"[^>]*>'
curl -sI https://www.jayantgoswami.com/ | grep -i location    # expect 301 → https://jayantgoswami.com/
```

Then check [securityheaders.com](https://securityheaders.com) (target A+) and
[Mozilla Observatory](https://developer.mozilla.org/en-US/observatory).

## Rollback

Workers & Pages → project → **Deployments** → pick the last good deployment → **⋯ → Rollback to
this deployment**. This is instant and needs no rebuild. Then revert the offending commit on `main`
so the next push doesn't redeploy it.

## Testing

The local server applies neither `_headers` nor Functions. To check pages under the real policy,
before pushing:

1. `SITE_URL=http://localhost:8080 bash build.sh`
2. Serve `dist/` and open each page with the CSP copied from `public/_headers` into a
   `<meta http-equiv="Content-Security-Policy">` tag. Drop `frame-ancestors` and `report-*`,
   which meta tags don't support. Then listen for `securitypolicyviolation` events.
3. The edge modules are standard ES modules using Web APIs only. They can be imported in a browser
   and driven with mock `context` objects (`request`, `env.ASSETS`, `next`) to exercise redirects,
   405s, fallbacks, timeouts and report parsing.

After deploying, use a **preview deployment** (any non-`main` branch) to confirm headers and
Functions behaviour on real Cloudflare infrastructure. Preview hosts are automatically `noindex`.

## Cloudflare configuration

Dashboard settings that complement the code. Paths are as of November 2026; Cloudflare reorganises
menus periodically.

### Bots and AI crawlers (Security → Settings, filter "Bot traffic")

| Setting | Value | Notes |
|---|---|---|
| Bot Fight Mode | **On** | Can't be bypassed with WAF skip rules. Its JavaScript Detections inline script is blocked by our CSP, which is expected and harmless |
| AI Labyrinth | **On** | Serves decoy pages to crawlers that ignore `robots.txt`. It never blocks or challenges real visitors |
| AI Crawler and Agent access policies | Search: **Allow** · Agents: **Allow** · Training: **Disallow** (+ Bot Preference Sync) | Matches `robots.txt`: be findable in AI search, not used for model training |

### Security.txt (Security → Settings, filter "Web application exploits")

The site already serves `/.well-known/security.txt` from the repository, which is version-controlled
and fingerprinted into the build. Cloudflare's insight checks its own dashboard feature. To clear it,
enter the same values there: Contact = the LinkedIn URL, Expires = the date in the file, Preferred
languages = `en`, Canonical = `https://jayantgoswami.com/.well-known/security.txt`. Keep both in sync
when renewing.

### SSL/TLS

- Edge Certificates: **Always Use HTTPS** on, **Minimum TLS version 1.2**, **TLS 1.3** on,
  **Automatic HTTPS Rewrites** on.
- Leave Cloudflare's HSTS setting off: the header comes from `_headers`, and two sources would
  conflict.

### DNS (DNS → Records / Settings)

| Record | Value | Why |
|---|---|---|
| DNSSEC | **Enable**, then add the DS record at the registrar (automatic if the registrar is Cloudflare) | Prevents DNS spoofing |
| `CAA` `jayantgoswami.com` | `0 issue "letsencrypt.org"`, `0 issue "pki.goog"`, `0 issue "ssl.com"`, `0 iodef "mailto:…"` optional | Only Cloudflare's certificate authorities may issue certificates |
| `TXT` `jayantgoswami.com` | `v=spf1 -all` | **Only if no email is sent from this domain:** blocks spoofed mail |
| `TXT` `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | Same condition |
| `MX` `jayantgoswami.com` | `0 .` (null MX) | Same condition |

If you later set up email on the domain, replace the SPF, DMARC and MX records with your provider's.

### Accounts

Use 2FA (security key or authenticator app) on Cloudflare, GitHub and the domain registrar. Enable
GitHub's secret scanning and Dependabot alerts on the repository (Settings → Code security).

## Recurring tasks

| When | Task |
|---|---|
| Every November | Renew `Expires` in `public/.well-known/security.txt` (and in Cloudflare's Security.txt if used) |
| Quarterly | Re-run securityheaders.com / Observatory; review Security → Events and a sample of CSP reports |
| On each resume update | Replace the PDF and keep the filename; the build re-scans it |
| Yearly | Review the `robots.txt` AI crawler list against Cloudflare's AI crawler directory |

## Incident runbooks

**Site down or 5xx:** check [Cloudflare Status](https://www.cloudflarestatus.com). Stream logs and
filter `level == "error"`. `outcome: "error"` means both the origin and the fallback failed, which
is a platform issue. A spike in `fallback` means the middleware path is unhealthy. Roll back to
the last good deployment.

**Unexpected CSP violations from the site's own origin:** a recent change likely added inline code
or an unsafe DOM write. Roll back, then fix the code (don't loosen the CSP).

**Unknown external origin in CSP reports across many visitors:** treat it as a possible compromise.
Roll back to a known-good deployment, rotate the Cloudflare and GitHub credentials, and review
recent commits and the GitHub audit log.

**Defacement or unexpected content:** roll back immediately, then check GitHub for unauthorised
commits and Cloudflare for unknown deployments or API tokens.

**Functions quota exhausted:** with fail-open configured, pages keep serving without tracing. Check
Security → Events for a bot flood and tighten bot settings or add a rate-limiting rule.
