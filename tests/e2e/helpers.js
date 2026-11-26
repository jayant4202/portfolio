import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Every public page in the build, as a URL path. The 404 page and the template are tested separately. */
export function allPages() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== "assets") walk(full); continue; }
      if (!name.endsWith(".html") || name === "404.html" || name.startsWith("_") || /^google[0-9a-f]+\.html$/.test(name)) continue;
      out.push("/" + relative("dist", full).replace(/\\/g, "/"));
    }
  };
  walk("dist");
  return out.sort();
}

/**
 * Records CSP violations and uncaught errors in the page. Init scripts are injected by the test
 * runner, not the page, so they aren't subject to the page's CSP.
 */
export async function watchPage(page) {
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // WebKit logs its own media-control icon loads as errors; they are browser-internal, not the site.
    if (m.text().startsWith("Button failed to load, iconName")) return;
    consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__violations.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  return {
    consoleErrors,
    violations: () => page.evaluate(() => window.__violations),
  };
}
