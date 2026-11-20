# Portfolio — AI-native fintech PM

A fast, static portfolio with a rate-limited live AI demo. No framework, no build step, no npm
dependencies — which keeps the attack surface tiny.

```
public/                 Everything that gets published
  index.html            Home (hero, featured work, assignments, CTA)
  work.html             Case studies + assignments, with filters
  demos.html            Live AI demo, demo videos, embedded prototypes (sandboxed)
  about.html            Experience, resume download, LinkedIn, interests & hobbies
  case-studies/*.html   One page per case study (copy _template.html)
  assignments/*.html    One page per assignment, linking to its PDF in assets/docs/
  assets/               CSS, JS, images, PDFs, resume, video (keep files under 25 MB)
  _headers              Security headers (CSP, HSTS, etc.)
  robots.txt, sitemap.xml  For search engines
functions/api/demo.js   Cloudflare Pages Function: the rate-limited Claude demo (never published as a file)
build.sh                Safety-checked build: public/ -> dist/ with your domain filled in
```

`build.sh` refuses to build if any page links to a site that isn't on its allow-list, uses an
unsafe or redirecting link, has a broken internal link, if a PDF contains scripts or other active
content, or if a non-website file (like `.env`) ends up in `public/`. A failed build means nothing
gets deployed, so the live site stays on its last good version.

## 1. Make it yours (search-and-replace)

| Find | Replace with |
|---|---|
| `YOUR-DOMAIN.com` | nothing — `build.sh` fills it in from `SITE_URL` |
| `<!-- ADD: ... -->` notes | details only you know, in the case-study pages |

Update your resume by replacing **`public/assets/Jayant-Goswami-Resume.pdf`** (keep the file name).
The LinkedIn link-preview image is `public/assets/img/og-image.png` (1200×630).

**Add a case study or assignment:** copy `public/case-studies/_template.html`,
edit it, add a card to `public/work.html`, and add its URL to `public/sitemap.xml`.
For a PDF-only assignment, drop it in `public/assets/docs/` and link the card straight to it.

**Add a prototype:** host it anywhere (Vercel, Streamlit, Lovable, Replit…), copy the card in
`public/demos.html`, set `data-demo-url`, and make sure its host is listed in `frame-src` in `public/_headers` and in `DEMO_HOST_SUFFIXES` in `public/assets/js/main.js`.

## 2. Deploy (free) on Cloudflare Pages

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   Build command: `bash build.sh`. Output directory: `dist`.
   Add an environment variable `SITE_URL` = `https://your-domain` (no trailing slash).
3. Workers & Pages → KV → create a namespace `portfolio-demo`.
   Pages project → Settings → Bindings → add KV binding **`DEMO_KV`** → that namespace.
4. Pages project → Settings → Variables and secrets:
   - `ANTHROPIC_API_KEY` (**Secret**) — from console.anthropic.com
   - `IP_HASH_SALT` (**Secret**) — any long random string
   - `ALLOWED_ORIGIN` — `https://your-domain.com` (exact, no trailing slash)
   - optional `PER_USER_DAILY` (default 5), `GLOBAL_DAILY` (default 300), `CLAUDE_MODEL` (default `claude-opus-5-5`)
5. Custom domains → add your domain (Cloudflare issues the HTTPS certificate automatically).
6. **In the Anthropic Console, set a monthly spend limit.** This is your hard cost ceiling.

## 3. Get found on Google

- Google Search Console → add your domain → submit `https://your-domain.com/sitemap.xml`.
- Put the site link in your LinkedIn "Featured" and "Contact info" sections — that is the
  fastest path to being indexed for your name.

## Security notes

What's in place:
- Static HTML only; the single server endpoint (`/api/demo`) validates and caps all input.
- The API key exists only as a Cloudflare secret, never in the browser or the repo.
- Strict CSP (no inline scripts/styles, no third-party scripts), HSTS, clickjacking protection,
  `nosniff`, locked-down Permissions-Policy.
- Demo abuse limits: per-visitor daily cap, global daily cap, same-origin check, Anthropic spend limit.
- Prototypes run in sandboxed iframes; model output is rendered as text, never HTML.
- No cookies, trackers or stored personal data.

What you should also do (no website can honestly be "100% secure"; these close the remaining gaps):
- Turn on 2FA for GitHub, Cloudflare, Anthropic and your domain registrar.
- In Cloudflare: enable "Always Use HTTPS", and optionally a WAF rate-limiting rule on `/api/*`.
- After deploying, check your headers at securityheaders.com (target: A+).
- Never commit `.env` / `.dev.vars` files (already in `.gitignore`).

## Run locally

Build first, then serve `dist/`:

    SITE_URL=http://localhost:8080 bash build.sh && ruby -run -e httpd dist -p 8080

The live demo needs Cloudflare (`npx wrangler pages dev .` once Node.js is installed).

## Getting a domain

1. Pick a name: `jayantgoswami.com` is ideal; `.in`, `.me` or `.dev` work if it's taken.
2. Buy it from **Cloudflare Registrar** (Cloudflare dashboard → Domain Registration → Register Domains).
   It sells at cost with no markup, includes free WHOIS privacy, and connects to Pages in one click.
   Turn on auto-renew and 2FA on the account.
3. Pages project → Custom domains → Set up a domain → enter it. Cloudflare adds the DNS records and
   HTTPS certificate automatically (usually live within minutes).
4. Set `SITE_URL` and `ALLOWED_ORIGIN` to `https://your-domain`,
   and redeploy.
5. Submit `https://your-domain/sitemap.xml` in Google Search Console and add the link to LinkedIn.
