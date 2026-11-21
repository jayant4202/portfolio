# Portfolio — Jayant Goswami, Product Manager (Fintech & AI)

A fast, fully static portfolio. No framework, no server code, no npm dependencies, no API keys —
which keeps the attack surface as small as it can be.

```
public/                 Everything that gets published
  index.html            Home: intro, photo, stats, featured case studies, assignments, demo
  work.html             All case studies + assignments, with filters
  demos.html            CampaignCrafter demo video
  about.html            Photo, bio, experience, education, skills, hobbies, resume
  case-studies/*.html   One page per case study (copy _template.html)
  assignments/*.html    One page per assignment, linking to its PDF in assets/docs/
  assets/               CSS, JS, images, PDFs, resume, video (keep files under 25 MB)
  _headers              Security headers (CSP, HSTS, etc.)
  robots.txt, sitemap.xml  For search engines
build.sh                Safety-checked build: public/ -> dist/ with your domain filled in
```

`build.sh` refuses to build if any page links to a site that isn't on its allow-list, uses an
unsafe or redirecting link, has a broken internal link, if a PDF contains scripts or other active
content, or if a non-website file (like `.env`) ends up in `public/`. A failed build means nothing
gets deployed, so the live site stays on its last good version.

## Updating the site

- **Resume:** replace `public/assets/Jayant-Goswami-Resume.pdf` (keep the file name).
- **Photo:** replace `public/assets/img/jayant-goswami.jpg` (720×720) and `jayant-goswami-360.jpg` (360×360).
- **Add a case study or assignment:** copy `public/case-studies/_template.html`, edit it, add a card
  to `public/work.html` (and update the counts on the filter buttons), and add its URL to
  `public/sitemap.xml`. PDFs go in `public/assets/docs/`.
- **`<!-- ADD: ... -->` notes** in the case-study pages mark details only you can fill in.

- **Results with trend arrows:** copy an existing result chip and change the number. The classes set
  the look: `kpi good up` (green ▲), `kpi good down` (green ▼, e.g. a time reduction),
  `kpi bad up` / `kpi bad down` (red), `kpi neutral` (no arrow, e.g. "95%").

      <span class="kpi good down"><span class="kpi-arrow" aria-hidden="true">▼</span>30%<span class="visually-hidden"> decrease (an improvement)</span></span>
- **Tags and skills** use Title Case (e.g. "API Integrations"); headings and buttons use sentence case.
- **Once a year:** update the `Expires` date in `public/.well-known/security.txt`.

Then commit and push in GitHub Desktop. Cloudflare rebuilds and republishes in about a minute.
`build.sh` stamps every CSS, JS and image link with a content fingerprint, so visitors always get the
new styles right after a deploy (no stale-cache layout glitches).

## Hosting (Cloudflare Pages)

- Build command: `bash build.sh` · Output directory: `dist`
- Environment variable: `SITE_URL` = `https://your-domain` (no trailing slash)
- Custom domain: Pages project → Custom domains.

The site no longer has a live AI demo, so it needs no API keys, KV storage or other secrets.

## Security notes

What's in place:
- Static HTML only — no server code, forms, accounts, cookies or trackers.
- Strict Content-Security-Policy: no inline code, no third-party scripts, no network calls, no
  embedded frames, no form submissions. Plus HSTS, clickjacking protection, `nosniff` and a
  locked-down Permissions-Policy.
- The only outside site any page links to is LinkedIn, enforced by `build.sh`.
- All downloadable PDFs were scanned: no scripts, auto-run actions or embedded files.

Keep doing:
- 2FA on GitHub, Cloudflare and your domain registrar.
- Check your headers occasionally at securityheaders.com (target: A or A+).
- Never commit `.env` files (already in `.gitignore`).

## Run locally

    SITE_URL=http://localhost:8080 bash build.sh && ruby -run -e httpd dist -p 8080

Then open http://localhost:8080.

## Get found on Google

- Google Search Console → add your domain → submit `https://your-domain/sitemap.xml`.
- Put the site link in your LinkedIn "Featured" and "Contact info" sections.
