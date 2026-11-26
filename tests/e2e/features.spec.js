import { test, expect } from "@playwright/test";
import { allPages } from "./helpers.js";

test.describe("theme picker", () => {
  test("defaults to dark even when the device prefers light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("switches theme, remembers it across pages, and System follows the device", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /Change theme/ });
    await toggle.click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-label", "Change theme (current: Light)");

    await page.goto("/about.html");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: /Change theme/ }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(11, 15, 23)");
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 248, 250)");
  });

  test("is keyboard operable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "keyboard test is for desktop");
    await page.goto("/");
    await page.getByRole("button", { name: /Change theme/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: /Change theme/ })).toBeFocused();
    await page.getByRole("button", { name: /Change theme/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  });
});

test.describe("work filters", () => {
  test("show only the chosen category", async ({ page }) => {
    await page.goto("/work.html");
    const caseStudies = page.locator('[data-kind="case-study"]');
    const assignments = page.locator('[data-kind="assignment"]');
    const total = (await caseStudies.count()) + (await assignments.count());
    expect(total).toBeGreaterThan(0);

    await page.locator('[data-filter="case-study"]').click();
    await expect(assignments.first()).toBeHidden();
    await expect(caseStudies.first()).toBeVisible();
    await expect(page.locator('[data-filter="case-study"]')).toHaveAttribute("aria-pressed", "true");

    await page.locator('[data-filter="assignment"]').click();
    await expect(caseStudies.first()).toBeHidden();
    await expect(assignments.first()).toBeVisible();

    await page.locator('[data-filter="all"]').click();
    await expect(caseStudies.first()).toBeVisible();
    await expect(assignments.first()).toBeVisible();
  });
});

test.describe("mobile menu", () => {
  test("opens, closes on Escape and on link click", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "menu is mobile-only");
    await page.goto("/");
    const btn = page.locator("[data-menu-toggle]");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".nav-links")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    await page.locator(".nav-links a", { hasText: "Work" }).click();
    await expect(page).toHaveURL(/\/work/);
  });
});

test.describe("media and downloads", () => {
  test("demo video loads", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Playwright WebKit ships without H.264; real Safari plays MP4");
    await page.goto("/demos.html");
    // The video uses preload="none" (it downloads only when played); load() is what play() triggers.
    const ready = await page.locator("video").evaluate((v) => new Promise((resolve) => {
      v.addEventListener("loadedmetadata", () => resolve(true));
      v.addEventListener("error", () => resolve(false));
      setTimeout(() => resolve(v.readyState >= 1), 10_000);
      v.load();
    }));
    expect(ready).toBe(true);
  });

  test("demo video downloads nothing until played, and shows a poster", async ({ page }) => {
    const mp4 = [];
    page.on("request", (r) => { if (r.url().includes(".mp4")) mp4.push(r.url()); });
    await page.goto("/demos.html", { waitUntil: "load" });
    await page.waitForTimeout(500);
    expect(mp4).toEqual([]);
    const poster = await page.locator("video").getAttribute("poster");
    expect((await page.request.get(poster)).ok()).toBe(true);
  });

  test("images use modern formats and hidden photos are not downloaded", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "format negotiation checked once, in Chromium");
    const images = [];
    page.on("response", (r) => { if (r.request().resourceType() === "image") images.push(r.url()); });
    await page.goto("/about.html", { waitUntil: "load" });
    await page.waitForTimeout(300);
    const photos = images.filter((u) => u.includes("jayant-goswami"));
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((u) => /\/assets\/h\/[^/]+\.[0-9a-f]{12}\.avif$/.test(new URL(u).pathname + "")), photos.join("\n")).toBe(true);
    const mobile = testInfo.project.name.startsWith("mobile");
    // Phones show the small avatar; desktop shows the large photo. Never both.
    expect(photos.some((u) => /jayant-goswami-(720|360)\.[0-9a-f]{12}\.avif/.test(u)), photos.join("\n")).toBe(!mobile);
  });

  test("resume downloads as a real PDF attachment", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator("a[download]").first().getAttribute("href");
    const res = await request.get(href);
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("a broken profile photo falls back to initials", async ({ page }) => {
    // Block every format (AVIF, WebP, JPEG): the browser uses whichever <picture> picks.
    await page.route(/jayant-goswami-avatar\.([0-9a-f]{12}\.)?(avif|webp|jpg)/, (r) => r.abort());
    await page.goto("/");
    await expect(page.locator(".brand-mark img")).toBeHidden();
    await expect(page.locator(".brand-mark")).toBeVisible();
  });

  test("a broken video shows a download link instead", async ({ page }) => {
    await page.route("**/*.mp4*", (r) => r.fulfill({ status: 500, body: "" }));
    await page.goto("/demos.html");
    // Mobile browsers defer loading until the visitor plays the video; load() is what play() triggers.
    // (Desktop browsers may already have failed and swapped in the fallback by now.)
    await page.evaluate(() => document.querySelector("video")?.load());
    await expect(page.locator("video")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(".demo-fallback a")).toBeVisible();
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("pages still render, dark by default, with all work cards visible", async ({ page }) => {
    await page.goto("/work.html");
    await expect(page.locator('[data-kind="assignment"]').first()).toBeVisible();
    await expect(page.locator('[data-kind="case-study"]').first()).toBeVisible();
    await expect(page.locator("[data-theme-picker]")).toBeHidden();
  });
});

test.describe("profile icons in the header", () => {
  test("every page has GitHub and LinkedIn icons at the top right that open the profiles safely", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "markup check runs once");
    for (const path of allPages()) {
      await page.goto(path);
      const links = page.locator(".site-header .social-links a");
      await expect(links, path).toHaveCount(2);
      const hrefs = await links.evaluateAll((as) => as.map((a) => [a.href, a.target, a.rel, a.getAttribute("aria-label")]));
      expect(hrefs, path).toEqual([
        ["https://github.com/jayant4202", "_blank", "me noopener noreferrer", "GitHub profile (opens in a new tab)"],
        ["https://www.linkedin.com/in/jayant-goswami/", "_blank", "me noopener noreferrer", "LinkedIn profile (opens in a new tab)"],
      ]);
      // The old text button is gone from the header only.
      await expect(page.locator(".site-header .btn", { hasText: "LinkedIn" })).toHaveCount(0);
    }
  });

  test("icons sit in the top-right corner, visible and clickable at every width", async ({ page }) => {
    for (const width of [320, 375, 412, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      for (const name of ["GitHub profile", "LinkedIn profile"]) {
        const icon = page.getByRole("link", { name: new RegExp(name) });
        await expect(icon, `${name} @${width}`).toBeVisible();
        const box = await icon.boundingBox();
        const brand = await page.locator(".brand").boundingBox();
        expect(box.x, `${name} @${width} is right of the logo`).toBeGreaterThan(brand.x + brand.width);
        expect(box.x + box.width, `${name} @${width} is inside the screen`).toBeLessThanOrEqual(width);
        // Right-aligned group: the icon sits in the right 55% of the header at every width.
        expect(box.x, `${name} @${width} is toward the right`).toBeGreaterThan(width * 0.45);
        expect(box.y, `${name} @${width} is in the header`).toBeLessThan(64);
        expect(box.width, `${name} @${width} tap target`).toBeGreaterThanOrEqual(34);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `overflow @${width}`).toBeLessThanOrEqual(1);
    }
  });

  test("other LinkedIn buttons and links on the pages are unchanged", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "markup check runs once");
    await page.goto("/");
    await expect(page.locator('main a[href="https://www.linkedin.com/in/jayant-goswami/"]').first()).toBeVisible();
    await expect(page.locator('footer a[href="https://www.linkedin.com/in/jayant-goswami/"]')).toHaveCount(1);
    await expect(page.locator('.nav-links .nav-mobile-only a[href="https://www.linkedin.com/in/jayant-goswami/"]')).toHaveCount(1);
  });
});

test.describe("stylesheet recovery", () => {
  test("if the stylesheet fails once, the page reloads itself and comes back styled", async ({ page }) => {
    let failures = 0;
    await page.route(/\/assets\/h\/style\.[0-9a-f]{12}\.css/, (r) => {
      if (failures++ === 0) return r.fulfill({ status: 404, body: "" });
      return r.continue();
    });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor), { timeout: 10_000 })
      .toBe("rgb(11, 15, 23)");
    expect(failures).toBe(2);
  });

  test("if the stylesheet keeps failing, it reloads only once (no loop)", async ({ page }) => {
    let loads = 0; // main-frame navigations to the site (Firefox also fires "load" for about:blank)
    page.on("framenavigated", (f) => { if (f === page.mainFrame() && f.url().startsWith("https:")) loads++; });
    await page.route(/\/assets\/h\/style\.[0-9a-f]{12}\.css/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/");
    await page.waitForTimeout(5_000);
    expect(loads).toBe(2);
    await expect(page.locator("main")).toBeVisible();
  });
});
