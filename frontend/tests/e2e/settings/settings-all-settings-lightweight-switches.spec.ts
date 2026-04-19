import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__browserSectionDefault";
const TARGET_ROW_ID =
  "ParamContainer-settings-section__browserSectionDefault-settings-codeobj__browserSectionDefault__browserSectionDefault__aspectRatio";
const SIBLING_SECTION_ID = "settings-section__promptSectionDefault";
const SIBLING_ROW_ID =
  "ParamContainer-settings-section__promptSectionDefault-settings-codeobj__promptSectionDefault__promptSectionDefault__aspectRatio";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_ROW_ID =
  "ParamContainer-settings-section__gui-settings-codeobj__gui__gui__leftSidePaneShiftsMap";
const BACKEND_SECTION_ID = "settings-section__backend";
const BACKEND_ROW_ID =
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__autobackup";
const CALLABLE_CANARY_SECTION_ID = "settings-section__callableSectionDefault";

test("canvas shell path paints lightweight switch visuals on the retained canvas across resting-text settings sections", async ({
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
    ({ callableSectionId, rowIds, sectionIds }) =>
      rowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement) &&
      sectionIds.every(
        (sectionId) =>
          document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
          HTMLElement,
      ) &&
      document.querySelector(
        `section[data-section-id="${callableSectionId}"]`,
      ) instanceof HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      callableSectionId: CALLABLE_CANARY_SECTION_ID,
      rowIds: [TARGET_ROW_ID, SIBLING_ROW_ID, GUI_ROW_ID, BACKEND_ROW_ID],
      sectionIds: [
        TARGET_SECTION_ID,
        SIBLING_SECTION_ID,
        GUI_SECTION_ID,
        BACKEND_SECTION_ID,
      ],
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({
      backendRowId,
      backendSectionId,
      callableSectionId,
      guiRowId,
      guiSectionId,
      siblingRowId,
      siblingSectionId,
      targetRowId,
      targetSectionId,
    }) => {
      const targetSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${targetSectionId}"]`,
      );
      if (!(targetSection instanceof HTMLElement)) {
        throw new Error(`Missing section ${targetSectionId}`);
      }

      const siblingSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${siblingSectionId}"]`,
      );
      if (!(siblingSection instanceof HTMLElement)) {
        throw new Error(`Missing section ${siblingSectionId}`);
      }

      const targetRow = document.getElementById(targetRowId);
      if (!(targetRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${targetRowId}`);
      }

      const targetSwitch = targetRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(targetSwitch instanceof HTMLElement)) {
        throw new Error(`Missing lightweight switch for ${targetRowId}`);
      }

      const siblingRow = document.getElementById(siblingRowId);
      if (!(siblingRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${siblingRowId}`);
      }

      const siblingSwitch = siblingRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(siblingSwitch instanceof HTMLElement)) {
        throw new Error(`Missing lightweight switch for ${siblingRowId}`);
      }

      const guiSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${guiSectionId}"]`,
      );
      if (!(guiSection instanceof HTMLElement)) {
        throw new Error(`Missing section ${guiSectionId}`);
      }

      const guiRow = document.getElementById(guiRowId);
      if (!(guiRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${guiRowId}`);
      }

      const guiSwitch = guiRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(guiSwitch instanceof HTMLElement)) {
        throw new Error(`Missing lightweight switch for ${guiRowId}`);
      }

      const backendSection = document.querySelector<HTMLElement>(
        `section[data-section-id="${backendSectionId}"]`,
      );
      if (!(backendSection instanceof HTMLElement)) {
        throw new Error(`Missing section ${backendSectionId}`);
      }

      const backendRow = document.getElementById(backendRowId);
      if (!(backendRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${backendRowId}`);
      }

      const backendSwitch = backendRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(backendSwitch instanceof HTMLElement)) {
        throw new Error(`Missing lightweight switch for ${backendRowId}`);
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
      const backendWrapper = backendRow.querySelector<HTMLElement>(
        '.section-value:not([data-canvas-owned-lightweight-switch="true"])',
      );
      const targetThumb = targetSwitch.querySelector<HTMLElement>(
        '[data-canvas-owned-switch-thumb="true"]',
      );
      const backendThumb = backendSwitch.querySelector<HTMLElement>(
        '[data-canvas-owned-switch-thumb="true"]',
      );

      return {
        backendCanvasThumbCount:
          backendSwitch.querySelectorAll('[data-canvas-owned-switch-thumb="true"]')
            .length,
        backendCanvasTrack: backendSwitch.getAttribute(
          "data-canvas-owned-switch-track",
        ),
        backendRootIsValueShell: backendSwitch.matches(".section-value"),
        backendSectionButtonSwitchCount:
          backendSection.querySelectorAll('button[role="switch"]').length,
        backendSectionLightweightSwitchCount: backendSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        backendValueShellWrapperCount: backendRow.querySelectorAll(
          '.section-value:not([data-canvas-owned-lightweight-switch="true"])',
        ).length,
        backendValueShellWrapperOpacity:
          backendWrapper instanceof HTMLElement
            ? window.getComputedStyle(backendWrapper).opacity
            : null,
        backendThumbBackgroundColor:
          backendThumb instanceof HTMLElement
            ? window.getComputedStyle(backendThumb).backgroundColor
            : null,
        callableCanvasTrackSwitchCount: callableSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"][data-canvas-owned-switch-track="true"]',
        ).length,
        guiRootIsValueShell: guiSwitch.matches(".section-value"),
        guiSectionButtonSwitchCount:
          guiSection.querySelectorAll('button[role="switch"]').length,
        guiSectionLightweightSwitchCount: guiSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        guiValueShellWrapperCount: guiRow.querySelectorAll(
          '.section-value:not([data-canvas-owned-lightweight-switch="true"])',
        ).length,
        siblingRootIsValueShell: siblingSwitch.matches(".section-value"),
        siblingSectionButtonSwitchCount:
          siblingSection.querySelectorAll('button[role="switch"]').length,
        siblingSectionLightweightSwitchCount: siblingSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        siblingSectionRoleSwitchCount:
          siblingSection.querySelectorAll('[role="switch"]').length,
        siblingValueShellWrapperCount: siblingRow.querySelectorAll(
          '.section-value:not([data-canvas-owned-lightweight-switch="true"])',
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
        settingsCanvasThumbCount: settingsSections.reduce(
          (count, section) =>
            count +
            section.querySelectorAll('[data-canvas-owned-switch-thumb="true"]').length,
          0,
        ),
        settingsCanvasTrackSwitchCount: settingsSections.reduce(
          (count, section) =>
            count +
            section.querySelectorAll(
              '[data-canvas-owned-lightweight-switch="true"][data-canvas-owned-switch-track="true"]',
            ).length,
          0,
        ),
        settingsRoleSwitchCount: settingsSections.reduce(
          (count, section) => count + section.querySelectorAll('[role="switch"]').length,
          0,
        ),
        targetAriaChecked: targetSwitch.getAttribute("aria-checked"),
        targetCanvasThumbCount:
          targetSwitch.querySelectorAll('[data-canvas-owned-switch-thumb="true"]')
            .length,
        targetCanvasTrack: targetSwitch.getAttribute(
          "data-canvas-owned-switch-track",
        ),
        targetLabel:
          targetRow.querySelector(".section-key")?.textContent?.replace(/\s+/g, " ").trim() ??
          null,
        targetRootBackgroundColor: window.getComputedStyle(targetSwitch).backgroundColor,
        targetRootIsValueShell: targetSwitch.matches(".section-value"),
        targetSectionButtonSwitchCount:
          targetSection.querySelectorAll('button[role="switch"]').length,
        targetSectionLightweightSwitchCount: targetSection.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        targetSectionRoleSwitchCount:
          targetSection.querySelectorAll('[role="switch"]').length,
        targetValueShellWrapperCount: targetRow.querySelectorAll(
          '.section-value:not([data-canvas-owned-lightweight-switch="true"])',
        ).length,
        targetTagName: targetSwitch.tagName,
        targetThumbBackgroundColor:
          targetThumb instanceof HTMLElement
            ? window.getComputedStyle(targetThumb).backgroundColor
            : null,
      };
    },
    {
      backendRowId: BACKEND_ROW_ID,
      backendSectionId: BACKEND_SECTION_ID,
      callableSectionId: CALLABLE_CANARY_SECTION_ID,
      guiRowId: GUI_ROW_ID,
      guiSectionId: GUI_SECTION_ID,
      siblingRowId: SIBLING_ROW_ID,
      siblingSectionId: SIBLING_SECTION_ID,
      targetRowId: TARGET_ROW_ID,
      targetSectionId: TARGET_SECTION_ID,
    },
  );
  console.log(
    `LIGHTWEIGHT_SWITCH_RESTING_STATE ${JSON.stringify(restingState, null, 2)}`,
  );

  expect(restingState.targetLabel).toBe("Aspect Ratio");
  expect(restingState.targetRootIsValueShell).toBe(true);
  expect(restingState.siblingRootIsValueShell).toBe(true);
  expect(restingState.guiRootIsValueShell).toBe(true);
  expect(restingState.backendRootIsValueShell).toBe(false);
  expect(restingState.targetTagName).toBe("DIV");
  expect(restingState.targetCanvasTrack).toBe("true");
  expect(restingState.targetCanvasThumbCount).toBe(1);
  expect(restingState.targetSectionButtonSwitchCount).toBe(0);
  expect(restingState.targetSectionLightweightSwitchCount).toBeGreaterThan(0);
  expect(restingState.targetSectionRoleSwitchCount).toBe(
    restingState.targetSectionLightweightSwitchCount,
  );
  expect(restingState.targetValueShellWrapperCount).toBe(0);
  expect(restingState.targetRootBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.targetThumbBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.siblingSectionButtonSwitchCount).toBe(0);
  expect(restingState.siblingSectionLightweightSwitchCount).toBeGreaterThan(0);
  expect(restingState.siblingSectionRoleSwitchCount).toBe(
    restingState.siblingSectionLightweightSwitchCount,
  );
  expect(restingState.siblingValueShellWrapperCount).toBe(0);
  expect(restingState.guiSectionButtonSwitchCount).toBe(0);
  expect(restingState.guiSectionLightweightSwitchCount).toBeGreaterThan(0);
  expect(restingState.guiValueShellWrapperCount).toBe(0);
  expect(restingState.backendSectionButtonSwitchCount).toBe(0);
  expect(restingState.backendSectionLightweightSwitchCount).toBeGreaterThan(0);
  expect(restingState.backendCanvasTrack).toBe("true");
  expect(restingState.backendCanvasThumbCount).toBe(1);
  expect(restingState.backendValueShellWrapperCount).toBe(1);
  expect(restingState.backendValueShellWrapperOpacity).toBe("0");
  expect(restingState.backendThumbBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingState.settingsButtonSwitchCount).toBe(0);
  expect(restingState.settingsCanvasTrackSwitchCount).toBeGreaterThan(80);
  expect(restingState.settingsCanvasThumbCount).toBe(
    restingState.settingsCanvasTrackSwitchCount,
  );
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
