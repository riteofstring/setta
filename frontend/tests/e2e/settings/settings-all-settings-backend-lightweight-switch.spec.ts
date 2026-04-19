import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__backend";
const TARGET_ROW_ID =
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__autosave";
const BACKEND_SWITCH_ROW_IDS = [
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__autoRefetchCallableParamsOnLspMismatch",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__autobackup",
  TARGET_ROW_ID,
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__clearTerminalBeforeMarkingAsReady",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__completionGuardEnabled",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__exportDbReadableOnSave",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__exportDbReadableWithVariantsOnSave",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__saveRenderedValues",
  "ParamContainer-settings-section__backend-settings-codeobj__backend__backend__showDefaultConfigOnLoad",
] as const;

test("canvas shell path uses lightweight backend switches without losing first-click toggle", async ({
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
    ({ rowIds, sectionId }) =>
      rowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement) &&
      document.querySelector(`section[data-section-id="${sectionId}"]`) instanceof
        HTMLElement &&
      document.querySelector(".react-flow__section-shell-backdrop canvas") instanceof
        HTMLCanvasElement,
    {
      rowIds: BACKEND_SWITCH_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ rowIds, sectionId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }

      const familyState = rowIds.map((rowId) => {
        const row = document.getElementById(rowId);
        if (!(row instanceof HTMLElement)) {
          throw new Error(`Missing row ${rowId}`);
        }

        const lightweightRoot = row.querySelector<HTMLElement>(
          '[data-canvas-owned-lightweight-switch="true"]',
        );
        if (!(lightweightRoot instanceof HTMLElement)) {
          throw new Error(`Missing lightweight switch root for ${rowId}`);
        }

        return {
          ariaChecked: lightweightRoot.getAttribute("aria-checked"),
          buttonSwitchCount: row.querySelectorAll('button[role="switch"]').length,
          lightweightFlag:
            lightweightRoot.dataset.canvasOwnedLightweightSwitch ?? null,
          roleSwitchCount: row.querySelectorAll('[role="switch"]').length,
          rowId,
          tagName: lightweightRoot.tagName,
        };
      });

      return {
        familyRowCount: familyState.length,
        familyState,
        sectionButtonSwitchCount:
          section.querySelectorAll('button[role="switch"]').length,
        sectionLightweightSwitchCount: section.querySelectorAll(
          '[data-canvas-owned-lightweight-switch="true"]',
        ).length,
        sectionRoleSwitchCount: section.querySelectorAll('[role="switch"]').length,
      };
    },
    {
      rowIds: BACKEND_SWITCH_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.familyRowCount).toBe(BACKEND_SWITCH_ROW_IDS.length);
  expect(restingState.sectionButtonSwitchCount).toBe(0);
  expect(restingState.sectionLightweightSwitchCount).toBe(
    BACKEND_SWITCH_ROW_IDS.length,
  );
  expect(restingState.sectionRoleSwitchCount).toBe(
    BACKEND_SWITCH_ROW_IDS.length,
  );
  expect(
    restingState.familyState.every(
      (rowState) =>
        rowState.lightweightFlag === "true" &&
        rowState.buttonSwitchCount === 0 &&
        rowState.roleSwitchCount === 1 &&
        rowState.tagName === "DIV" &&
        (rowState.ariaChecked === "true" || rowState.ariaChecked === "false"),
    ),
  ).toBe(true);

  const targetSwitch = page.locator(
    `#${TARGET_ROW_ID} [data-canvas-owned-lightweight-switch="true"]`,
  );
  const initialAriaChecked = await targetSwitch.getAttribute("aria-checked");
  expect(initialAriaChecked === "true" || initialAriaChecked === "false").toBe(
    true,
  );
  if (initialAriaChecked !== "true" && initialAriaChecked !== "false") {
    throw new Error(`Unexpected initial switch state: ${initialAriaChecked}`);
  }

  const toggledAriaChecked = initialAriaChecked === "true" ? "false" : "true";
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
  await expect(targetSwitch).toHaveAttribute("aria-checked", initialAriaChecked);
  await expect(targetSwitch).toHaveAttribute(
    "data-state",
    initialAriaChecked === "true" ? "checked" : "unchecked",
  );
});
