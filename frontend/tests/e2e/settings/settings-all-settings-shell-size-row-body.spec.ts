import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ShellSizeTarget = {
  expectedChildLightweightRowCount: number;
  heightParamInfoId: string;
  sectionId: string;
  sizeParamInfoId: string;
  widthParamInfoId: string;
};

const SHELL_SIZE_TARGETS: ShellSizeTarget[] = [
  {
    expectedChildLightweightRowCount: 2,
    heightParamInfoId:
      "settings-codeobj__callableSectionDefault__callableSectionDefault__size__height",
    sectionId: "settings-section__callableSectionDefault",
    sizeParamInfoId:
      "settings-codeobj__callableSectionDefault__callableSectionDefault__size",
    widthParamInfoId:
      "settings-codeobj__callableSectionDefault__callableSectionDefault__size__width",
  },
  {
    expectedChildLightweightRowCount: 2,
    heightParamInfoId:
      "settings-codeobj__dictSectionDefault__dictSectionDefault__size__height",
    sectionId: "settings-section__dictSectionDefault",
    sizeParamInfoId: "settings-codeobj__dictSectionDefault__dictSectionDefault__size",
    widthParamInfoId:
      "settings-codeobj__dictSectionDefault__dictSectionDefault__size__width",
  },
  {
    expectedChildLightweightRowCount: 2,
    heightParamInfoId:
      "settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__size__height",
    sectionId: "settings-section__globalVariablesSectionDefault",
    sizeParamInfoId:
      "settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__size",
    widthParamInfoId:
      "settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__size__width",
  },
];

test("canvas shell path flattens the shared shell size row bodies", async ({
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

  const summaries = [];
  for (const target of SHELL_SIZE_TARGETS) {
    const sizeRowId = `ParamContainer-${target.sectionId}-${target.sizeParamInfoId}`;
    const heightRowId = `ParamContainer-${target.sectionId}-${target.heightParamInfoId}`;
    const widthRowId = `ParamContainer-${target.sectionId}-${target.widthParamInfoId}`;
    const heightInputId = `${target.sectionId}-${target.heightParamInfoId}-ParamInput`;
    const heightEditorId = `CodeMirror-${target.sectionId}-${target.heightParamInfoId}`;

    await page.waitForFunction(
      ({ heightInputId, heightRowId, sectionId, sizeRowId, widthRowId }) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        const sizeRow = document.getElementById(sizeRowId);
        const heightRow = document.getElementById(heightRowId);
        const widthRow = document.getElementById(widthRowId);
        const heightInput = document.getElementById(heightInputId);
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".react-flow__section-shell-backdrop canvas",
        );
        return (
          section instanceof HTMLElement &&
          sizeRow instanceof HTMLElement &&
          heightRow instanceof HTMLElement &&
          widthRow instanceof HTMLElement &&
          heightInput instanceof HTMLElement &&
          canvas instanceof HTMLCanvasElement &&
          canvas.clientWidth > 0 &&
          canvas.clientHeight > 0 &&
          canvas.width > 0 &&
          canvas.height > 0
        );
      },
      {
        heightInputId,
        heightRowId,
        sectionId: target.sectionId,
        sizeRowId,
        widthRowId,
      },
    );

    const summary = await page.evaluate(
      ({
        heightInputId,
        heightRowId,
        sectionId,
        sizeRowId,
        widthRowId,
      }) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        const sizeRow = document.getElementById(sizeRowId);
        const heightRow = document.getElementById(heightRowId);
        const widthRow = document.getElementById(widthRowId);
        const heightInput = document.getElementById(heightInputId);

        if (!(section instanceof HTMLElement)) {
          throw new Error(`Missing section ${sectionId}`);
        }
        if (!(sizeRow instanceof HTMLElement)) {
          throw new Error(`Missing size row ${sizeRowId}`);
        }
        if (!(heightRow instanceof HTMLElement)) {
          throw new Error(`Missing height row ${heightRowId}`);
        }
        if (!(widthRow instanceof HTMLElement)) {
          throw new Error(`Missing width row ${widthRowId}`);
        }
        if (!(heightInput instanceof HTMLElement)) {
          throw new Error(`Missing height input ${heightInputId}`);
        }

        return {
          childLightweightRowCount: sizeRow.querySelectorAll(
            '[data-canvas-owned-lightweight-row-body="true"]',
          ).length,
          directNestedGuideWrapperCount: sizeRow.querySelectorAll(
            ".section-args-nested.section-key-value",
          ).length,
          heightInputOpacity: window.getComputedStyle(heightInput).opacity,
          heightInputRestingTextLightweight:
            heightInput.dataset.canvasOwnedRestingTextLightweight ?? null,
          heightRowDisplay: window.getComputedStyle(heightRow).display,
          heightRowLightweight:
            heightRow.dataset.canvasOwnedLightweightRowBody ?? null,
          sizeRowDisplay: window.getComputedStyle(sizeRow).display,
          sizeRowLightweight:
            sizeRow.dataset.canvasOwnedLightweightRowBody ?? null,
          sizeRowNestedGuideLightweight:
            sizeRow.dataset.canvasOwnedNestedGuideLightweight ?? null,
          widthRowDisplay: window.getComputedStyle(widthRow).display,
          widthRowLightweight:
            widthRow.dataset.canvasOwnedLightweightRowBody ?? null,
        };
      },
      {
        heightInputId,
        heightRowId,
        sectionId: target.sectionId,
        sizeRowId,
        widthRowId,
      },
    );

    expect(summary.sizeRowLightweight).toBe("true");
    expect(summary.sizeRowNestedGuideLightweight).toBe("true");
    expect(summary.sizeRowDisplay).toBe("contents");
    expect(summary.heightRowLightweight).toBe("true");
    expect(summary.heightRowDisplay).toBe("contents");
    expect(summary.widthRowLightweight).toBe("true");
    expect(summary.widthRowDisplay).toBe("contents");
    expect(summary.directNestedGuideWrapperCount).toBe(0);
    expect(summary.childLightweightRowCount).toBeGreaterThanOrEqual(
      target.expectedChildLightweightRowCount,
    );
    expect(summary.heightInputRestingTextLightweight).toBe("true");
    expect(summary.heightInputOpacity).toBe("0");

    await page.locator(`#${heightInputId}`).focus();
    await expect(page.locator(`#${heightEditorId}`)).toBeVisible();

    summaries.push({
      ...target,
      ...summary,
      heightEditorId,
      heightInputId,
      heightRowId,
      sizeRowId,
      widthRowId,
    });
  }

  await testInfo.attach("shell-size-row-body-summary", {
    body: JSON.stringify(summaries, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_SHELL_SIZE_ROW_BODY ${JSON.stringify(summaries, null, 2)}`,
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
