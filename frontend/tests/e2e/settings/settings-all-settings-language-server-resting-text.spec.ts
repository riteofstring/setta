import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__languageServer";
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportUnknownVariableType";
const TARGET_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const TARGET_INPUT_ID = `${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}-ParamInput`;
const TARGET_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const NESTED_GUIDE_ROW_IDS = [
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright",
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright__analysis",
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides",
] as const;
const LEAF_ROW_IDS = [
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportSelfClsParameterName",
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportUnannotatedClassAttribute",
  "ParamContainer-settings-section__languageServer-settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportUnknownMemberType",
  TARGET_ROW_ID,
] as const;

type RowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

test("canvas shell path owns the language-server nested resting-text chain and keeps first-click activation", async ({
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
    ({ leafRowIds, nestedGuideRowIds, sectionId, targetInputId }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const targetInput = document.getElementById(targetInputId);

      return (
        section instanceof HTMLElement &&
        targetInput instanceof HTMLElement &&
        leafRowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement) &&
        nestedGuideRowIds.every(
          (rowId) => document.getElementById(rowId) instanceof HTMLElement,
        ) &&
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    {
      leafRowIds: LEAF_ROW_IDS,
      nestedGuideRowIds: NESTED_GUIDE_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
      targetInputId: TARGET_INPUT_ID,
    },
  );

  const restingState = await page.evaluate(
    ({ leafRowIds, nestedGuideRowIds, sectionId, targetInputId, targetRowId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const targetInput = document.getElementById(targetInputId);
      const targetRow = document.getElementById(targetRowId);

      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(targetInput instanceof HTMLElement)) {
        throw new Error(`Missing target input ${targetInputId}`);
      }
      if (!(targetRow instanceof HTMLElement)) {
        throw new Error(`Missing target row ${targetRowId}`);
      }
      if (
        !leafRowIds.every((rowId) => document.getElementById(rowId) instanceof HTMLElement)
      ) {
        throw new Error("Missing one or more leaf language-server rows");
      }
      if (
        !nestedGuideRowIds.every(
          (rowId) => document.getElementById(rowId) instanceof HTMLElement,
        )
      ) {
        throw new Error("Missing one or more nested language-server rows");
      }

      const rowRect = targetRow.getBoundingClientRect();

      return {
        leafRowCount: leafRowIds.length,
        lightweightRestingTextCount: section.querySelectorAll(
          '[data-canvas-owned-resting-text-lightweight="true"]',
        ).length,
        liveEditorCount: section.querySelectorAll(".cm-editor").length,
        nestedGuideLightweightCount: section.querySelectorAll(
          'article[data-canvas-owned-nested-guide-lightweight="true"]',
        ).length,
        nestedGuideWrapperDivCount: section.querySelectorAll(
          'div[data-canvas-owned-nested-guide="true"]',
        ).length,
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
      leafRowIds: LEAF_ROW_IDS,
      nestedGuideRowIds: NESTED_GUIDE_ROW_IDS,
      sectionId: TARGET_SECTION_ID,
      targetInputId: TARGET_INPUT_ID,
      targetRowId: TARGET_ROW_ID,
    },
  );

  await testInfo.attach("language-server-resting-state", {
    body: JSON.stringify(restingState, null, 2),
    contentType: "application/json",
  });

  expect(restingState.leafRowCount).toBe(4);
  expect(restingState.lightweightRestingTextCount).toBe(4);
  expect(restingState.underlineCount).toBe(4);
  expect(restingState.nestedGuideLightweightCount).toBe(3);
  expect(restingState.nestedGuideWrapperDivCount).toBe(0);
  expect(restingState.liveEditorCount).toBe(0);
  expect(restingState.targetInputLightweightFlag).toBe("true");
  expect(restingState.targetInputOpacity).toBe("0");

  await page.evaluate(({ targetInputId }) => {
    const targetInput = document.getElementById(targetInputId);
    if (!(targetInput instanceof HTMLElement)) {
      throw new Error(`Missing target input ${targetInputId}`);
    }

    targetInput.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, {
    targetInputId: TARGET_INPUT_ID,
  });

  await page.waitForFunction(
    ({ editorId, sectionId, targetInputId }) => {
      const editor = document.getElementById(editorId);
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      return (
        editor instanceof HTMLElement &&
        editor.querySelector(".cm-editor") instanceof HTMLElement &&
        !(document.getElementById(targetInputId) instanceof HTMLElement) &&
        section?.querySelectorAll(".cm-editor").length === 1
      );
    },
    {
      editorId: TARGET_EDITOR_ID,
      sectionId: TARGET_SECTION_ID,
      targetInputId: TARGET_INPUT_ID,
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

  await testInfo.attach("language-server-live-state", {
    body: JSON.stringify(liveState, null, 2),
    contentType: "application/json",
  });

  expect(liveState.liveEditorCount).toBe(1);
  expect(liveState.remainingLightweightRestingTextCount).toBe(3);
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
