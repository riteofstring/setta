import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__nestedParamCodeObjDefault";
const CORE_NAME_TYPE_PARAM_INFO_ID =
  "settings-codeobj__nestedParamCodeObjDefault__nestedParamCodeObjDefault__coreNameType";
const TYPE_ANNOTATION_PARAM_INFO_ID =
  "settings-codeobj__nestedParamCodeObjDefault__nestedParamCodeObjDefault__typeAnnotation";
const CORE_NAME_EDITABLE_PARAM_INFO_ID =
  "settings-codeobj__nestedParamCodeObjDefault__nestedParamCodeObjDefault__coreNameEditable";
const CORE_NAME_TYPE_INPUT_ID = `${TARGET_SECTION_ID}-${CORE_NAME_TYPE_PARAM_INFO_ID}-ParamInput`;
const TYPE_ANNOTATION_INPUT_ID = `${TARGET_SECTION_ID}-${TYPE_ANNOTATION_PARAM_INFO_ID}-ParamInput`;
const TYPE_ANNOTATION_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TYPE_ANNOTATION_PARAM_INFO_ID}`;
const CORE_NAME_EDITABLE_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${CORE_NAME_EDITABLE_PARAM_INFO_ID}`;

test("canvas shell path owns the nested param resting rows", async ({
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
    ({ coreNameEditableRowId, coreNameTypeInputId, sectionId, typeAnnotationInputId }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const coreNameTypeInput = document.getElementById(coreNameTypeInputId);
      const typeAnnotationInput = document.getElementById(typeAnnotationInputId);
      const coreNameEditableRow = document.getElementById(coreNameEditableRowId);
      return (
        section instanceof HTMLElement &&
        coreNameTypeInput instanceof HTMLElement &&
        typeAnnotationInput instanceof HTMLElement &&
        coreNameEditableRow instanceof HTMLElement &&
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    {
      coreNameEditableRowId: CORE_NAME_EDITABLE_ROW_ID,
      coreNameTypeInputId: CORE_NAME_TYPE_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
      typeAnnotationInputId: TYPE_ANNOTATION_INPUT_ID,
    },
  );

  const summary = await page.evaluate(
    ({
      coreNameEditableRowId,
      coreNameTypeInputId,
      sectionId,
      typeAnnotationInputId,
    }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const coreNameTypeInput = document.getElementById(coreNameTypeInputId);
      const typeAnnotationInput = document.getElementById(typeAnnotationInputId);
      const coreNameEditableRow = document.getElementById(coreNameEditableRowId);
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(coreNameTypeInput instanceof HTMLElement)) {
        throw new Error(`Missing input ${coreNameTypeInputId}`);
      }
      if (!(typeAnnotationInput instanceof HTMLElement)) {
        throw new Error(`Missing input ${typeAnnotationInputId}`);
      }
      if (!(coreNameEditableRow instanceof HTMLElement)) {
        throw new Error(`Missing row ${coreNameEditableRowId}`);
      }
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing retained shell canvas");
      }

      const switchRoot = coreNameEditableRow.querySelector<HTMLElement>(
        '[data-canvas-owned-lightweight-switch="true"]',
      );
      if (!(switchRoot instanceof HTMLElement)) {
        throw new Error("Missing lightweight switch root");
      }

      const readInputSummary = (input: HTMLElement) => ({
        lightweightOwnershipFlag:
          input.dataset.canvasOwnedRestingTextLightweight ?? null,
        opacity: window.getComputedStyle(input).opacity,
        textSpanCount: input.querySelectorAll(".cm-line span").length,
      });

      return {
        canvasSize: {
          clientHeight: canvas.clientHeight,
          clientWidth: canvas.clientWidth,
          height: canvas.height,
          width: canvas.width,
        },
        coreNameEditableSectionValueCount:
          coreNameEditableRow.querySelectorAll(".section-value").length,
        coreNameEditableSwitchTrack:
          switchRoot.dataset.canvasOwnedSwitchTrack ?? null,
        coreNameType: readInputSummary(coreNameTypeInput),
        typeAnnotation: readInputSummary(typeAnnotationInput),
      };
    },
    {
      coreNameEditableRowId: CORE_NAME_EDITABLE_ROW_ID,
      coreNameTypeInputId: CORE_NAME_TYPE_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
      typeAnnotationInputId: TYPE_ANNOTATION_INPUT_ID,
    },
  );

  expect(summary.canvasSize.width).toBeGreaterThan(0);
  expect(summary.canvasSize.height).toBeGreaterThan(0);
  expect(summary.coreNameType.lightweightOwnershipFlag).toBe("true");
  expect(summary.coreNameType.opacity).toBe("0");
  expect(summary.coreNameType.textSpanCount).toBe(0);
  expect(summary.typeAnnotation.lightweightOwnershipFlag).toBe("true");
  expect(summary.typeAnnotation.opacity).toBe("0");
  expect(summary.typeAnnotation.textSpanCount).toBe(0);
  expect(summary.coreNameEditableSwitchTrack).toBe("true");
  expect(summary.coreNameEditableSectionValueCount).toBe(1);

  await page.locator(`#${TYPE_ANNOTATION_INPUT_ID}`).focus();
  await expect(page.locator(`#${TYPE_ANNOTATION_EDITOR_ID}`)).toBeVisible();

  await testInfo.attach("nested-param-resting-text-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_NESTED_PARAM_RESTING_TEXT ${JSON.stringify(summary, null, 2)}`,
  );
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button")
    .filter({ has: page.locator(".icon-fitview") })
    .first();

  if (await fitView.isVisible().catch(() => false)) {
    await fitView.click();
  }
}
