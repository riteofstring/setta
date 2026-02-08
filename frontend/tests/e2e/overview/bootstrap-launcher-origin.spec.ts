import { expect, test } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("bootstrap launcher origin ignores non-http(s) values", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("setta.launcherOrigin");
  });

  const raw = "javascript:alert(1)";
  const url = `${BACKEND_ORIGIN}/__setta__/bootstrap#lo=${encodeURIComponent(raw)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const stored = await page.evaluate(() =>
    localStorage.getItem("setta.launcherOrigin"),
  );
  expect(stored).toBeNull();
});

test("bootstrap launcher origin stores http(s) origin", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("setta.launcherOrigin");
  });

  const raw = "https://example.com/path?query=1";
  const url = `${BACKEND_ORIGIN}/__setta__/bootstrap#lo=${encodeURIComponent(raw)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const stored = await page.evaluate(() =>
    localStorage.getItem("setta.launcherOrigin"),
  );
  expect(stored).toBe("https://example.com");
});
