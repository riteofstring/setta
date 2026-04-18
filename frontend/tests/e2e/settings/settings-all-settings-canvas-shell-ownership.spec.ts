import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";

test("canvas shell path owns the resting callable section chrome", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await page.waitForFunction((sectionId) => {
    return (
      document.querySelector(`section[data-section-id="${sectionId}"]`) !==
        null &&
      document.getElementById(`${sectionId}-CustomResizable`) !== null &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") !==
        null
    );
  }, TARGET_SECTION_ID);

  const shellState = await page.evaluate((sectionId) => {
    const outer = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    const inner = document.getElementById(`${sectionId}-CustomResizable`);
    const canvas = document.querySelector(
      ".react-flow__section-shell-backdrop canvas",
    );

    if (!(outer instanceof HTMLElement)) {
      throw new Error(`Missing outer shell for ${sectionId}`);
    }
    if (!(inner instanceof HTMLElement)) {
      throw new Error(`Missing inner shell for ${sectionId}`);
    }
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Missing retained shell canvas");
    }

    const outerStyle = window.getComputedStyle(outer);
    const innerStyle = window.getComputedStyle(inner);
    const innerBeforeStyle = window.getComputedStyle(inner, "::before");

    return {
      outerOwnershipFlag: outer.dataset.canvasOwnedShell ?? null,
      innerOwnershipFlag: inner.dataset.canvasOwnedShell ?? null,
      outerBackground: outerStyle.backgroundColor,
      outerBorderColor: outerStyle.borderTopColor,
      innerBackground: innerStyle.backgroundColor,
      innerBeforeBorderWidth: innerBeforeStyle.borderTopWidth,
    };
  }, TARGET_SECTION_ID);

  expect(shellState.outerOwnershipFlag).toBe("true");
  expect(shellState.innerOwnershipFlag).toBe("true");
  expect(shellState.outerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.outerBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBeforeBorderWidth).toBe("0px");
});
