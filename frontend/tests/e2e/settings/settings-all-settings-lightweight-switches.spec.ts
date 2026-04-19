import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__chatSectionDefault";
const TARGET_ROW_ID =
  "ParamContainer-settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__aspectRatio";
const CALLABLE_CANARY_SECTION_ID = "settings-section__callableSectionDefault";

test("canvas shell path uses lightweight switch activators across settings sections", async ({
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
    ({ rowId, targetSectionId, callableSectionId }) =>
      document.getElementById(rowId) instanceof HTMLElement &&
      document.querySelector(`section[data-section-id="${targetSectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(
        `section[data-section-id="${callableSectionId}"]`,
      ) instanceof HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      callableSectionId: CALLABLE_CANARY_SECTION_ID,
      rowId: TARGET_ROW_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ callableSectionId, rowId, targetSectionId }) => {
      const targetSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${targetSectionId}"]`,
      );
      if (!(targetSection instanceof HTMLElement)) {
        throw new Error(`Missing section ${targetSectionId}`);
      }

      const targetRow = document.getElementById(rowId);
      if (!(targetRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${rowId}`);
      }

      const targetSwitch = targetRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(targetSwitch instanceof HTMLElement)) {
        throw new Error(`Missing lightweight switch for ${rowId}`);
      }

      const callableSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${callableSectionId}"]`,
      );
      if (!(callableSection instanceof HTMLElement)) {
        throw new Error(`Missing callable section ${callableSectionId}`);
      }

      const settingsSections = Array.from(
        document.querySelectorAll<HTMLElement>(
          'section[data-section-id^="settings-section__"]',
        ),
      );

      return {
        callableCanvasTrackSwitchCount: callableSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"][data-canvas-owned-switch-track="true"]',
        ).length,
        settingsButtonSwitchCount: settingsSections.reduce(
          (count, section) => count + section.querySelectorAll('button[role="switch"]').length,
          0,
        ),
        settingsLightweightSwitchCount: settingsSections.reduce(
          (count, section) =>
            count +
            section.querySelectorAll('[data-canvas-owned-lightweight-switch="true"]').length,
          0,
        ),
        settingsRoleSwitchCount: settingsSections.reduce(
          (count, section) => count + section.querySelectorAll('[role="switch"]').length,
          0,
        ),
        targetAriaChecked: targetSwitch.getAttribute("aria-checked"),
        targetLabel:
          targetRow.querySelector(".section-key")?.textContent?.replace(/\s+/g, " ").trim() ??
          null,
        targetSectionButtonSwitchCount:
          targetSection.querySelectorAll('button[role="switch"]').length,
        targetSectionLightweightSwitchCount: targetSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        targetTagName: targetSwitch.tagName,
      };
    },
    {
      callableSectionId: CALLABLE_CANARY_SECTION_ID,
      rowId: TARGET_ROW_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.targetLabel).toBe("Aspect Ratio");
  expect(restingState.targetTagName).toBe("DIV");
  expect(restingState.targetSectionButtonSwitchCount).toBe(0);
  expect(restingState.targetSectionLightweightSwitchCount).toBeGreaterThan(0);
  expect(restingState.settingsButtonSwitchCount).toBe(0);
  expect(restingState.settingsLightweightSwitchCount).toBeGreaterThan(100);
  expect(restingState.settingsRoleSwitchCount).toBe(
    restingState.settingsLightweightSwitchCount,
  );
  expect(restingState.callableCanvasTrackSwitchCount).toBeGreaterThan(0);
  expect(
    restingState.targetAriaChecked === "true" ||
      restingState.targetAriaChecked === "false",
  ).toBe(true);
  if (
    restingState.targetAriaChecked !== "true" &&
    restingState.targetAriaChecked !== "false"
  ) {
    throw new Error(
      `Unexpected initial switch state: ${restingState.targetAriaChecked}`,
    );
  }

  const targetSwitch = page.locator(
    `#${TARGET_ROW_ID} [data-canvas-owned-lightweight-switch="true"]`,
  );
  const toggledAriaChecked =
    restingState.targetAriaChecked === "true" ? "false" : "true";

  await page.evaluate(({ rowId }) => {
    const lightweightRoot = document.querySelector<HTMLElement>(
      `#${rowId} [data-canvas-owned-lightweight-switch="true"]`,
    );
    if (!(lightweightRoot instanceof HTMLElement)) {
      throw new Error(`Missing lightweight switch for ${rowId}`);
    }

    lightweightRoot.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, { rowId: TARGET_ROW_ID });
  await expect(targetSwitch).toHaveAttribute("aria-checked", toggledAriaChecked);
  await expect(targetSwitch).toHaveAttribute(
    "data-state",
    toggledAriaChecked === "true" ? "checked" : "unchecked",
  );

  await page.evaluate(({ rowId }) => {
    const lightweightRoot = document.querySelector<HTMLElement>(
      `#${rowId} [data-canvas-owned-lightweight-switch="true"]`,
    );
    if (!(lightweightRoot instanceof HTMLElement)) {
      throw new Error(`Missing lightweight switch for ${rowId}`);
    }

    lightweightRoot.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, { rowId: TARGET_ROW_ID });
  await expect(targetSwitch).toHaveAttribute(
    "aria-checked",
    restingState.targetAriaChecked,
  );
  await expect(targetSwitch).toHaveAttribute(
    "data-state",
    restingState.targetAriaChecked === "true" ? "checked" : "unchecked",
  );
});
