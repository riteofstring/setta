import { expect, test } from "@playwright/test";
import { ensureAppReady } from "./helpers";

const LIGHT_THEME_COLOR = "#dce1ea";
const DARK_THEME_COLOR = "#0b0e13";
const LIGHT_BAR_COLOR = "rgb(220, 225, 234)";
const DARK_BAR_COLOR = "rgb(11, 14, 19)";

test("titlebar theme colors follow color mode", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "setta_data",
      JSON.stringify({
        state: { colorMode: "light", darkMode: false },
        version: 0,
      }),
    );
  });

  await ensureAppReady(page);

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    LIGHT_THEME_COLOR,
  );
  await expect(page.locator(".setta-titlebar")).toHaveCSS(
    "background-color",
    LIGHT_BAR_COLOR,
  );

  await page.evaluate(async () => {
    const { setColorModePreference } = await import(
      "/src/state/actions/localStorage"
    );
    setColorModePreference("dark");
  });

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    DARK_THEME_COLOR,
  );
  await expect(page.locator(".setta-titlebar")).toHaveCSS(
    "background-color",
    DARK_BAR_COLOR,
  );
});
