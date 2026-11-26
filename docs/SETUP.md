# Mac setup guide

A step-by-step guide to everything needed to develop, test, automate and maintain this site on a
Mac (Apple silicon, macOS 15 or later). Each step lists what it is for, the command, and how to
check it worked. Follow the steps in order; they take about 30–45 minutes, mostly waiting for
downloads.

Commands go in the **Terminal** app (Applications → Utilities → Terminal). Paste one block at a
time.

| Step | What | Needed for | Required? |
|---|---|---|---|
| 1 | Xcode Command Line Tools | git, compilers | ✅ Required |
| 2 | Homebrew | Installing everything else | ✅ Required |
| 3 | Git identity + GitHub tools | Version control | ✅ Required |
| 4 | Node.js 22 (via fnm) | Running the tests and local server | ✅ Required |
| 5 | Project dependencies + test browsers | Tests, local server | ✅ Required |
| 6 | Quality and security tools | ShellCheck, gitleaks, Semgrep, jq | ✅ Required |
| 7 | Pre-commit safety hook | Blocks secrets and broken builds before they are committed | ⭐ Recommended |
| 8 | Editor | Editing with live test feedback | ⭐ Recommended |
| 9 | Cloudflare CLI login | Live logs, future prototypes | ⭐ Recommended |
| 10 | Account security | Protecting GitHub and Cloudflare | ✅ Required |
| 11 | Later: prototypes and payments | Stripe CLI, security scanner | 🔜 When needed |

---

## 1. Xcode Command Line Tools

Apple's developer basics: `git`, `make` and compilers. Many other tools depend on them.

- Link: [developer.apple.com/xcode/resources](https://developer.apple.com/xcode/resources/)

```bash
xcode-select --install
```

A window opens: click **Install**, accept the licence, and wait (5–15 minutes).

**Check:** `git --version` prints a version, such as `git version 2.x`.

## 2. Homebrew

The standard package manager for macOS. Every tool below installs and updates through it.

- Link: [brew.sh](https://brew.sh)

Copy the install command shown at the top of [brew.sh](https://brew.sh) and paste it into
Terminal. It asks for your Mac password; type it yourself. **When it finishes, it prints "Next
steps" with two commands** that add `brew` to your PATH. Run both.

**Check:** `brew --version` prints a version, and `brew doctor` says "Your system is ready to brew".

## 3. Git identity and GitHub tools

Git records who made each change. Use the same email as your GitHub account; GitHub's private
`noreply` address works and keeps your real email out of public history.

- GitHub Desktop: [desktop.github.com](https://desktop.github.com) (already installed)
- GitHub CLI: [cli.github.com](https://cli.github.com) (view CI runs and pull requests from Terminal)

```bash
git config --global user.name "Jayant Goswami"
git config --global user.email "<your GitHub noreply email>"   # GitHub → Settings → Emails
git config --global init.defaultBranch main
brew install gh
gh auth login          # choose GitHub.com → HTTPS → Login with a web browser
```

**Check:** `gh auth status` shows "Logged in to github.com".

## 4. Node.js 22 (via fnm)

Node runs the test tools and the local Cloudflare server. **fnm** (Fast Node Manager) installs the
exact Node version the project pins in `.nvmrc`, and switches automatically when you `cd` into the
project.

- fnm: [github.com/Schniz/fnm](https://github.com/Schniz/fnm) · Homebrew page: [formulae.brew.sh/formula/fnm](https://formulae.brew.sh/formula/fnm)
- Node.js: [nodejs.org](https://nodejs.org/en/download)

```bash
brew install fnm
echo 'eval "$(fnm env --use-on-cd --version-file-strategy=recursive --shell zsh)"' >> ~/.zshrc
source ~/.zshrc
cd ~/Downloads/"Claude Projetcs"/portfolio
fnm install            # reads .nvmrc → installs Node 22
```

**Check:** `node --version` prints `v22.x` inside the project folder.

<details><summary>Alternative without fnm</summary>

`brew install node@22`, then
`echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`.
See [formulae.brew.sh/formula/node@22](https://formulae.brew.sh/formula/node@22).
</details>

## 5. Project dependencies and test browsers

Installs the exact tool versions recorded in `package-lock.json`, all dev-only:

| Tool | Used for | Docs |
|---|---|---|
| Playwright | Cross-browser end-to-end tests | [playwright.dev](https://playwright.dev/docs/intro) |
| axe-core | Accessibility scanning inside Playwright | [github.com/dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) |
| Vitest | Unit tests for the edge code | [vitest.dev](https://vitest.dev) |
| Wrangler | Cloudflare CLI: local server with real headers and Functions, live logs | [developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) |
| html-validate | HTML standards and accessibility linting | [html-validate.org](https://html-validate.org) |
| Lighthouse CI | Performance, accessibility and SEO budgets | [github.com/GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) |

```bash
cd ~/Downloads/"Claude Projetcs"/portfolio
npm ci
npx playwright install          # Chromium, Firefox, WebKit (~1 GB, one time)
```

Lighthouse needs Google Chrome: install it from [google.com/chrome](https://www.google.com/chrome/)
if you don't have it.

**Check:** `npm test` ends with all tests passing (about a minute).

## 6. Quality and security tools

| Tool | Used for | Link |
|---|---|---|
| ShellCheck | Lints `build.sh` and scripts | [shellcheck.net](https://www.shellcheck.net) |
| gitleaks | Finds secrets (API keys, tokens) before they reach GitHub | [github.com/gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) |
| Semgrep | Scans the JavaScript for security bugs | [semgrep.dev](https://semgrep.dev/docs/getting-started/quickstart) |
| jq | Filters the JSON request logs | [jqlang.org](https://jqlang.org) |

```bash
brew install shellcheck gitleaks semgrep jq
```

**Check:**

```bash
npm run lint:sh                                    # no output = clean
gitleaks git --redact .                            # "no leaks found"
semgrep scan --config p/javascript --config p/secrets --metrics off functions lib public/assets/js
```

## 7. Pre-commit safety hook (recommended)

Runs automatically every time you commit, including from GitHub Desktop. It **blocks the commit**
if it contains a secret, or if the site would fail its release gate. It takes about 3 seconds.

```bash
cd ~/Downloads/"Claude Projetcs"/portfolio
git config core.hooksPath .githooks
```

**Check:** in GitHub Desktop, a commit shows a short pause. If something is wrong, it shows the
hook's message instead of committing. To bypass in a genuine emergency, run
`git commit --no-verify` in Terminal. Don't make a habit of it.

## 8. Editor (recommended)

**Visual Studio Code**, a free editor with extensions that run the tests and lint as you type.

- Link: [code.visualstudio.com](https://code.visualstudio.com) (or `brew install --cask visual-studio-code`)
- Extensions:
  - [Playwright Test for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright): run or debug any browser test with a click, watch it run
  - [ShellCheck](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck): inline script warnings
  - [html-validate](https://marketplace.visualstudio.com/items?itemName=html-validate.vscode-html-validate): inline HTML errors

**Claude Code** (already installed) can make changes and run `npm run check` for you:
[docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code/overview).

## 9. Cloudflare CLI login (recommended)

This lets Wrangler stream the site's live request logs to your Terminal, and later deploy
prototypes.

```bash
cd ~/Downloads/"Claude Projetcs"/portfolio
npx wrangler login          # opens the browser to approve access
npx wrangler pages project list
```

Stream live logs (see [OBSERVABILITY.md](OBSERVABILITY.md)):

```bash
npx wrangler pages deployment tail --project-name <your project> --format json | jq -c 'select(.level != "info")'
```

## 10. Account security (required)

The site is only as safe as the accounts that can change it.

| Account | Action | Link |
|---|---|---|
| GitHub | 2FA with an authenticator app or security key | [docs.github.com: 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa) · [Settings → Security](https://github.com/settings/security) |
| GitHub repo | Settings → Code security: turn on **Secret scanning**, **Push protection**, **Dependabot alerts** | Repo settings |
| Cloudflare | 2FA: My Profile → Authentication | [dash.cloudflare.com](https://dash.cloudflare.com) |
| Domain registrar | 2FA and registrar lock | Your registrar's site |

## 11. Later: hosted prototypes and payments

Install these when you start [roadmap v2.0](ROADMAP.md#later-hosted-prototypes-with-free-trials-v20):

| Tool | Used for | Install | Link |
|---|---|---|---|
| Stripe CLI | Test payments and webhooks locally | `brew install stripe/stripe-cli/stripe` | [docs.stripe.com/stripe-cli](https://docs.stripe.com/stripe-cli) |
| OWASP ZAP | Attack-style security scan of the live site and prototypes | `brew install --cask zap` | [zaproxy.org](https://www.zaproxy.org/download/) |

Wrangler (step 5) already covers Workers, KV, D1, Durable Objects and Turnstile.

---

## Daily workflow

```bash
cd ~/Downloads/"Claude Projetcs"/portfolio
npm run dev        # preview at https://localhost:8788 (accept the local certificate once)
# … edit files …
npm run check      # lint + all tests; must pass before you push
```

Then:
1. Record the change under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md).
2. Commit in GitHub Desktop; the pre-commit hook runs.
3. Push.
4. Check the run on GitHub's **Actions** tab.
5. After the deploy, `npm run smoke` confirms the live site.

## Keeping tools up to date

| How often | Command / action |
|---|---|
| Weekly | Merge Dependabot's update PRs once CI is green (it updates `package.json`, the lock file and CI) |
| Monthly | `brew update && brew upgrade` (Homebrew tools) |
| After Playwright updates | `npx playwright install` (new browser versions) |
| When `.nvmrc` changes | `fnm install` |
| Yearly | Renew `security.txt` Expires (the smoke test warns 30 days ahead) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `command not found: brew` | Run the two "Next steps" commands from step 2, then open a new Terminal window |
| `command not found: node` | Open a new Terminal window or run `source ~/.zshrc`; then `fnm install` in the project folder |
| `npm ci` fails | Make sure `node --version` is 22.x; delete `node_modules` and retry |
| Playwright: "Executable doesn't exist" | `npx playwright install` |
| Lighthouse: "Chrome not found" | Install Google Chrome, or run with `CHROME_PATH` pointing to a Chrome binary |
| `npm run dev` shows a certificate warning | Expected: it's a local self-signed certificate. Click through once |
| Port 8788 in use | A previous `npm run dev` is still running: `pkill -f "wrangler pages dev"` |
| GitHub Desktop says the hook failed | Read the message. It's either a secret in the commit (remove it) or a build-gate failure (run `npm run build` to see why) |
| `xcode-select: note: No developer tools were found` | Step 1 isn't finished. Run `xcode-select --install` again |
