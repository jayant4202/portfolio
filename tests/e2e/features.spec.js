import { test, expect } from "@playwright/test";

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
    const ready = await page.locator("video").evaluate((v) => new Promise((resolve) => {
      if (v.readyState >= 1) return resolve(true);
      v.addEventListener("loadedmetadata", () => resolve(true));
      v.addEventListener("error", () => resolve(false));
      setTimeout(() => resolve(v.readyState >= 1), 10_000);
    }));
    expect(ready).toBe(true);
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
    await page.route("**/jayant-goswami-avatar.jpg*", (r) => r.abort());
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
