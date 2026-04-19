import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";

test("canvas shell path uses lightweight section menu triggers across settings sections", async ({
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
    ({ sectionId }) =>
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(
        `section[data-section-id="${sectionId}"] [data-canvas-owned-lightweight-menu-trigger="true"]`,
      ) instanceof HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(({ sectionId }) => {
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

    const targetTrigger = targetSection.querySelector<HTMLElement>(
      '[data-canvas-owned-lightweight-menu-trigger="true"]',
    );
    if (!(targetTrigger instanceof HTMLElement)) {
      throw new Error(`Missing lightweight menu trigger for ${sectionId}`);
    }

    return {
      settingsButtonMenuTriggerCount: settingsSections.reduce(
        (count, section) =>
          count + section.querySelectorAll('button[role="menuitem"]').length,
        0,
      ),
      settingsLightweightMenuTriggerCount: settingsSections.reduce(
        (count, section) =>
          count +
          section.querySelectorAll(
            '[data-canvas-owned-lightweight-menu-trigger="true"]',
          ).length,
        0,
      ),
      settingsRoleMenuTriggerCount: settingsSections.reduce(
        (count, section) =>
          count + section.querySelectorAll('[role="menuitem"]').length,
        0,
      ),
      targetRole: targetTrigger.getAttribute("role"),
      targetSectionButtonMenuTriggerCount: targetSection.querySelectorAll(
        'button[role="menuitem"]',
      ).length,
      targetSectionLightweightCount: targetSection.querySelectorAll(
        '[data-canvas-owned-lightweight-menu-trigger="true"]',
      ).length,
      targetTagName: targetTrigger.tagName,
    };
  }, { sectionId: TARGET_SECTION_ID });

  expect(restingState.settingsButtonMenuTriggerCount).toBe(0);
  expect(restingState.settingsLightweightMenuTriggerCount).toBeGreaterThan(20);
  expect(restingState.settingsRoleMenuTriggerCount).toBe(
    restingState.settingsLightweightMenuTriggerCount,
  );
  expect(restingState.targetSectionButtonMenuTriggerCount).toBe(0);
  expect(restingState.targetSectionLightweightCount).toBe(1);
  expect(restingState.targetTagName).toBe("DIV");
  expect(restingState.targetRole).toBe("menuitem");

  await page.evaluate(({ sectionId }) => {
    const trigger = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"] [data-canvas-owned-lightweight-menu-trigger="true"]`,
    );
    if (!(trigger instanceof HTMLElement)) {
      throw new Error(`Missing lightweight menu trigger for ${sectionId}`);
    }

    trigger.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    trigger.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );
    trigger.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
      }),
    );
    trigger.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
  }, { sectionId: TARGET_SECTION_ID });

  await expect(
    page.getByRole("menuitem", { name: "Clear Values", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menuitem", { name: "Clear Values", exact: true }),
  ).toBeHidden();
});
