import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__backend";
const BACKEND_TEXT_PARAM_INFO_IDS = [
  "settings-codeobj__backend__backend__autobackupFreq",
  "settings-codeobj__backend__backend__autobackupKeepLastN",
  "settings-codeobj__backend__backend__defaultTerminalShell",
] as const;
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__backend__backend__defaultTerminalShell";
const BACKEND_TEXT_ROW_IDS = BACKEND_TEXT_PARAM_INFO_IDS.map(
  (paramInfoId) => `ParamContainer-${TARGET_SECTION_ID}-${paramInfoId}`,
);
const TARGET_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const TARGET_INPUT_ID = `${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}-ParamInput`;
const TARGET_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;

type RowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

test("canvas shell path owns backend plain text rows at rest and keeps first-click activation", async ({
  page,
}, testInfo) => {
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
    () => document.querySelectorAll(".react-flow__node").length > 13,
  );
  await clickFitViewIfVisible(page);

  await page.waitForFunction(
    ({ inputId, rowIds, sectionId }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const targetInput = document.getElementById(inputId);

      return (
        section instanceof HTMLElement &&
        targetInput instanceof HTMLElement &&
        rowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement) &&
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    {
      inputId: TARGET_INPUT_ID,
      rowIds: BACKEND_TEXT_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
    },
  );

  const restingState = await page.evaluate(
    ({ inputId, paramInfoIds, sectionId, targetRowId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const targetInput = document.getElementById(inputId);
      const targetRow = document.getElementById(targetRowId);

      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(targetInput instanceof HTMLElement)) {
        throw new Error(`Missing target input ${inputId}`);
      }
      if (!(targetRow instanceof HTMLElement)) {
        throw new Error(`Missing target row ${targetRowId}`);
      }

      const rowStates = paramInfoIds.map((paramInfoId) => {
        const rowId = `ParamContainer-${sectionId}-${paramInfoId}`;
        const row = document.getElementById(rowId);
        const rowInputId = `${sectionId}-${paramInfoId}-ParamInput`;
        const rowInput = document.getElementById(rowInputId);
        if (!(row instanceof HTMLElement)) {
          throw new Error(`Missing row ${rowId}`);
        }
        if (!(rowInput instanceof HTMLElement)) {
          throw new Error(`Missing input ${rowInputId}`);
        }

        return {
          inputId: rowInputId,
          inputOpacity: window.getComputedStyle(rowInput).opacity,
          lightweightFlag:
            rowInput.dataset.canvasOwnedRestingTextLightweight ?? null,
          rowId,
        };
      });

      const rowRect = targetRow.getBoundingClientRect();

      return {
        lightweightRestingTextCount: section.querySelectorAll(
          '[data-canvas-owned-resting-text-lightweight="true"]',
        ).length,
        liveEditorCount: section.querySelectorAll(".cm-editor").length,
        rowStates,
        targetInputLightweightFlag:
          targetInput.dataset.canvasOwnedRestingTextLightweight ?? null,
        targetInputOpacity: window.getComputedStyle(targetInput).opacity,
        targetRowRect: {
          height: rowRect.height,
          width: rowRect.width,
          x: rowRect.x,
          y: rowRect.y,
        } satisfies RowRect,
        underlineCount: section.querySelectorAll(
          '[data-canvas-owned-underline="true"]',
        ).length,
      };
    },
    {
      inputId: TARGET_INPUT_ID,
      paramInfoIds: BACKEND_TEXT_PARAM_INFO_IDS,
      sectionId: TARGET_SECTION_ID,
      targetRowId: TARGET_ROW_ID,
    },
  );

  await testInfo.attach("backend-resting-text-state", {
    body: JSON.stringify(restingState, null, 2),
    contentType: "application/json",
  });

  expect(restingState.rowStates).toHaveLength(BACKEND_TEXT_PARAM_INFO_IDS.length);
  expect(restingState.lightweightRestingTextCount).toBeGreaterThanOrEqual(
    BACKEND_TEXT_PARAM_INFO_IDS.length,
  );
  expect(restingState.underlineCount).toBeGreaterThanOrEqual(
    BACKEND_TEXT_PARAM_INFO_IDS.length,
  );
  expect(restingState.liveEditorCount).toBe(0);
  expect(restingState.targetInputLightweightFlag).toBe("true");
  expect(restingState.targetInputOpacity).toBe("0");
  expect(
    restingState.rowStates.every(
      (rowState) =>
        rowState.lightweightFlag === "true" && rowState.inputOpacity === "0",
    ),
  ).toBe(true);

  await page.evaluate(({ inputId }) => {
    const targetInput = document.getElementById(inputId);
    if (!(targetInput instanceof HTMLElement)) {
      throw new Error(`Missing target input ${inputId}`);
    }

    targetInput.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, { inputId: TARGET_INPUT_ID });

  await page.waitForFunction(
    ({ editorId, inputId, sectionId }) => {
      const editor = document.getElementById(editorId);
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      return (
        editor instanceof HTMLElement &&
        editor.querySelector(".cm-editor") instanceof HTMLElement &&
        !(document.getElementById(inputId) instanceof HTMLElement) &&
        section?.querySelectorAll(".cm-editor").length === 1
      );
    },
    {
      editorId: TARGET_EDITOR_ID,
      inputId: TARGET_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const liveState = await page.evaluate(
    ({ editorId, sectionId, targetRowId }) => {
      const editor = document.getElementById(editorId);
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const targetRow = document.getElementById(targetRowId);

      if (!(editor instanceof HTMLElement)) {
        throw new Error(`Missing live editor ${editorId}`);
      }
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(targetRow instanceof HTMLElement)) {
        throw new Error(`Missing target row ${targetRowId}`);
      }

      const rowRect = targetRow.getBoundingClientRect();

      return {
        liveEditorCount: section.querySelectorAll(".cm-editor").length,
        remainingLightweightRestingTextCount: section.querySelectorAll(
          '[data-canvas-owned-resting-text-lightweight="true"]',
        ).length,
        targetEditorContainsActiveElement:
          document.activeElement instanceof HTMLElement &&
          editor.contains(document.activeElement),
        targetRowRect: {
          height: rowRect.height,
          width: rowRect.width,
          x: rowRect.x,
          y: rowRect.y,
        } satisfies RowRect,
      };
    },
    {
      editorId: TARGET_EDITOR_ID,
      sectionId: TARGET_SECTION_ID,
      targetRowId: TARGET_ROW_ID,
    },
  );

  await testInfo.attach("backend-live-text-state", {
    body: JSON.stringify(liveState, null, 2),
    contentType: "application/json",
  });

  expect(liveState.liveEditorCount).toBe(1);
  expect(liveState.remainingLightweightRestingTextCount).toBe(
    restingState.lightweightRestingTextCount - 1,
  );
  expect(liveState.targetEditorContainsActiveElement).toBe(true);
  expect(Math.abs(liveState.targetRowRect.height - restingState.targetRowRect.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(liveState.targetRowRect.width - restingState.targetRowRect.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(liveState.targetRowRect.x - restingState.targetRowRect.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(liveState.targetRowRect.y - restingState.targetRowRect.y)).toBeLessThanOrEqual(2);
});

async function clickFitViewIfVisible(page: Page) {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });

  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
