import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { allPages, watchPage } from "./helpers.js";

// Every page: loads cleanly under the production CSP, renders without layout overflow,
// all images load, dark theme by default, and no serious accessibility violations.
for (const path of allPages()) {
  test.describe(path, () => {
    test("loads cleanly", async ({ page }) => {
      const watch = await watchPage(page);
      const res = await page.goto(path, { waitUntil: "load" });
      expect(res.status()).toBe(200);

      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await watch.violations(), "CSP violations").toEqual([]);
      expect(watch.consoleErrors, "console errors").toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(1);

      const broken = await page.evaluate(() =>
        [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      expect(broken, "broken images").toEqual([]);

      // The stylesheet passed its SRI check and applied (body background comes from the CSS).
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(11, 15, 23)");
    });

    test("has no serious accessibility violations", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "axe runs once, in Chromium");
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
      expect(serious).toEqual([]);
    });
  });
}

test("unknown URLs get the custom 404 page with a 404 status", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res.status()).toBe(404);
  await expect(page.locator("h1")).toBeVisible();
});

test("every internal link on every page resolves", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "link crawl runs once");
  const links = new Set();
  for (const path of allPages()) {
    await page.goto(path);
    for (const href of await page.$$eval("a[href^='/'], img[src^='/'], source[src^='/'], link[href^='/']",
      (els) => els.map((e) => e.getAttribute("href") || e.getAttribute("src")))) links.add(href.split("#")[0]);
  }
  const failures = [];
  for (const href of links) {
    if (!href) continue;
    const res = await request.get(href, { maxRedirects: 3 });
    if (!res.ok()) failures.push(`${res.status()} ${href}`);
  }
  expect(failures).toEqual([]);
});
