import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__gui";
const META_CONTROL_SECTION_ID = "settings-section__colorPickerParamCodeObjDefault";
const DRAW_SECTION_ID = "settings-section__drawSectionDefault";

test("canvas shell path uses lightweight color-input activators across settings sections", async ({
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
    ({ drawSectionId, metaControlSectionId, targetSectionId }) =>
      document.querySelector(`section[data-section-id="${targetSectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(
        `section[data-section-id="${metaControlSectionId}"]`,
      ) instanceof HTMLElement &&
      document.querySelector(`section[data-section-id="${drawSectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      drawSectionId: DRAW_SECTION_ID,
      metaControlSectionId: META_CONTROL_SECTION_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ drawSectionId, metaControlSectionId, targetSectionId }) => {
      const getSection = (sectionId: string) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        if (!(section instanceof HTMLElement)) {
          throw new Error(`Missing section ${sectionId}`);
        }
        return section;
      };

      const settingsSections = Array.from(
        document.querySelectorAll<HTMLElement>(
          'section[data-section-id^="settings-section__"]',
        ),
      );
      const targetSection = getSection(targetSectionId);
      const metaControlSection = getSection(metaControlSectionId);
      const drawSection = getSection(drawSectionId);
      const targetActivator = targetSection.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-color-input="true"]',
      );
      if (!(targetActivator instanceof HTMLElement)) {
        throw new Error(`Missing lightweight color activator in ${targetSectionId}`);
      }

      return {
        drawSectionLightweightColorCount: drawSection.querySelectorAll(
          '[data-canvas-owned-lightweight-color-input="true"]',
        ).length,
        metaControlSectionLightweightColorCount:
          metaControlSection.querySelectorAll(
            '[data-canvas-owned-lightweight-color-input="true"]',
          ).length,
        settingsLightweightColorCount: settingsSections.reduce(
          (count, section) =>
            count +
            section.querySelectorAll(
              '[data-canvas-owned-lightweight-color-input="true"]',
            ).length,
          0,
        ),
        settingsNativeColorInputCount: settingsSections.reduce(
          (count, section) =>
            count + section.querySelectorAll('input[type="color"]').length,
          0,
        ),
        targetActivatorRole: targetActivator.getAttribute("role"),
        targetActivatorTagName: targetActivator.tagName,
        targetSectionLightweightColorCount: targetSection.querySelectorAll(
          '[data-canvas-owned-lightweight-color-input="true"]',
        ).length,
      };
    },
    {
      drawSectionId: DRAW_SECTION_ID,
      metaControlSectionId: META_CONTROL_SECTION_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.settingsNativeColorInputCount).toBe(0);
  expect(restingState.settingsLightweightColorCount).toBe(6);
  expect(restingState.targetSectionLightweightColorCount).toBe(4);
  expect(restingState.metaControlSectionLightweightColorCount).toBe(1);
  expect(restingState.drawSectionLightweightColorCount).toBe(1);
  expect(restingState.targetActivatorTagName).toBe("DIV");
  expect(restingState.targetActivatorRole).toBe("button");

  await page.evaluate((targetSectionId) => {
    const targetActivator = document.querySelector<HTMLElement>(
      `section[data-section-id="${targetSectionId}"] [data-canvas-owned-lightweight-color-input="true"]`,
    );
    if (!(targetActivator instanceof HTMLElement)) {
      throw new Error(`Missing lightweight color activator in ${targetSectionId}`);
    }
    targetActivator.click();
  }, TARGET_SECTION_ID);

  await page.waitForFunction((targetSectionId) => {
    const targetInput = document.querySelector<HTMLInputElement>(
      `section[data-section-id="${targetSectionId}"] input[type="color"]`,
    );
    return (
      targetInput instanceof HTMLInputElement &&
      document.activeElement === targetInput
    );
  }, TARGET_SECTION_ID);

  await page.evaluate((targetSectionId) => {
    const targetInput = document.querySelector<HTMLInputElement>(
      `section[data-section-id="${targetSectionId}"] input[type="color"]`,
    );
    if (!(targetInput instanceof HTMLInputElement)) {
      throw new Error(`Missing live color input in ${targetSectionId}`);
    }
    targetInput.blur();
  }, TARGET_SECTION_ID);

  await expect(
    page.locator(`section[data-section-id="${TARGET_SECTION_ID}"] input[type="color"]`),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `section[data-section-id="${TARGET_SECTION_ID}"] [data-canvas-owned-lightweight-color-input="true"]`,
    ).first(),
  ).toBeAttached();
});
