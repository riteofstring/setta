import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";
const TARGET_FILTER_ID = `${TARGET_SECTION_ID}-args-filter`;

test("canvas shell path uses lightweight param filter activators across settings sections", async ({
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

  await page.waitForFunction(
    ({ filterId, sectionId }) =>
      document.getElementById(filterId) instanceof HTMLElement &&
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      filterId: TARGET_FILTER_ID,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(({ filterId, sectionId }) => {
    const settingsSections = Array.from(
      document.querySelectorAll<HTMLElement>(
        'section[data-section-id^="settings-section__"]',
      ),
    );
    const targetSection = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    if (!(targetSection instanceof HTMLElement)) {
      throw new Error(`Missing section ${sectionId}`);
    }

    const targetActivator = document.getElementById(filterId);
    if (!(targetActivator instanceof HTMLElement)) {
      throw new Error(`Missing activator ${filterId}`);
    }

    return {
      settingsFilterInputCount: settingsSections.reduce(
        (count, section) =>
          count + section.querySelectorAll('input[id$="-args-filter"]').length,
        0,
      ),
      settingsLightweightFilterCount: settingsSections.reduce(
        (count, section) =>
          count +
          section.querySelectorAll(
            '[data-canvas-owned-lightweight-filter-activator="true"]',
          ).length,
        0,
      ),
      targetRole: targetActivator.getAttribute("role"),
      targetSectionFilterInputCount: targetSection.querySelectorAll(
        'input[id$="-args-filter"]',
      ).length,
      targetSectionLightweightFilterCount: targetSection.querySelectorAll(
        '[data-canvas-owned-lightweight-filter-activator="true"]',
      ).length,
      targetTagName: targetActivator.tagName,
      targetText: targetActivator.textContent?.trim() ?? null,
    };
  }, { filterId: TARGET_FILTER_ID, sectionId: TARGET_SECTION_ID });

  expect(restingState.settingsFilterInputCount).toBe(0);
  expect(restingState.settingsLightweightFilterCount).toBeGreaterThan(20);
  expect(restingState.targetSectionFilterInputCount).toBe(0);
  expect(restingState.targetSectionLightweightFilterCount).toBe(1);
  expect(restingState.targetTagName).toBe("DIV");
  expect(restingState.targetRole).toBe("searchbox");
  expect(restingState.targetText).toBe("Filter");

  await page.evaluate((filterId) => {
    const filterActivator = document.getElementById(filterId);
    if (!(filterActivator instanceof HTMLElement)) {
      throw new Error(`Missing activator ${filterId}`);
    }
    filterActivator.focus();
  }, TARGET_FILTER_ID);

  const liveInput = page.locator(`input#${TARGET_FILTER_ID}`);
  await expect(liveInput).toBeVisible();
  await expect(liveInput).toBeFocused();

  await liveInput.blur();
  await expect(page.locator(`[data-canvas-owned-lightweight-filter-activator="true"]#${TARGET_FILTER_ID}`)).toBeVisible();
  await expect(page.locator(`input#${TARGET_FILTER_ID}`)).toHaveCount(0);

  await page.locator(`#${TARGET_FILTER_ID}`).click();
  await expect(liveInput).toBeVisible();
  await expect(liveInput).toBeFocused();
});
