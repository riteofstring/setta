import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__stateMachineStartSectionDefault";
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label";
const TARGET_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const TARGET_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const CLUSTER_TARGETS = [
  {
    minimumLightweightParamLabelCount: 14,
    minimumRowCount: 15,
    sectionId: "settings-section__spreadsheetSectionDefault",
  },
  {
    minimumLightweightParamLabelCount: 11,
    minimumRowCount: 12,
    sectionId: "settings-section__taskBoardSectionDefault",
  },
  {
    minimumLightweightParamLabelCount: 11,
    minimumRowCount: 12,
    sectionId: "settings-section__stateMachineStartSectionDefault",
  },
] as const;

test("canvas shell path uses lightweight param-label roots across untouched settings sections", async ({
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
    ({ rowId, sectionId }) => {
      const section = document.querySelector(
        `section[data-section-id="${sectionId}"]`,
      );
      const row = document.getElementById(rowId);
      return section instanceof HTMLElement && row instanceof HTMLElement;
    },
    {
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  const summary = await page.evaluate(
    ({
      clusterTargets,
      rowId,
    }: {
      clusterTargets: typeof CLUSTER_TARGETS;
      rowId: string;
    }) => {
      const row = document.getElementById(rowId);
      const label = row?.querySelector<HTMLElement>(".section-key");
      if (!(row instanceof HTMLElement)) {
        throw new Error(`Missing row ${rowId}`);
      }
      if (!(label instanceof HTMLElement)) {
        throw new Error(`Missing label for ${rowId}`);
      }

      return {
        canonicalLabel: {
          lightweightOwnershipFlag:
            label.dataset.canvasOwnedParamLabelLightweight ?? null,
          opacity: window.getComputedStyle(label).opacity,
          text: label.textContent?.trim() ?? null,
        },
        sectionSummaries: clusterTargets.map((target) => {
          const section = document.querySelector<HTMLElement>(
            `section[data-section-id="${target.sectionId}"]`,
          );
          if (!(section instanceof HTMLElement)) {
            throw new Error(`Missing section ${target.sectionId}`);
          }

          return {
            labelCount: section.querySelectorAll(".section-key").length,
            legacyLeadingContentWrapperCount: section.querySelectorAll(
              '.section-key:not([data-canvas-owned-param-label-lightweight="true"])',
            ).length,
            lightweightParamLabelCount: section.querySelectorAll(
              '[data-canvas-owned-param-label-lightweight="true"]',
            ).length,
            minimumLightweightParamLabelCount:
              target.minimumLightweightParamLabelCount,
            minimumRowCount: target.minimumRowCount,
            rowCount: section.querySelectorAll('article[id^="ParamContainer-"]')
              .length,
            sectionId: target.sectionId,
          };
        }),
      };
    },
    {
      clusterTargets: CLUSTER_TARGETS,
      rowId: TARGET_ROW_ID,
    },
  );

  await testInfo.attach("lightweight-param-label-generalization-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });

  expect(summary.canonicalLabel.lightweightOwnershipFlag).toBe("true");
  expect(summary.canonicalLabel.opacity).not.toBe("0");
  expect(summary.canonicalLabel.text).toBe("Label");
  for (const sectionSummary of summary.sectionSummaries) {
    expect(sectionSummary.rowCount).toBeGreaterThanOrEqual(
      sectionSummary.minimumRowCount,
    );
    expect(sectionSummary.lightweightParamLabelCount).toBeGreaterThanOrEqual(
      sectionSummary.minimumLightweightParamLabelCount,
    );
    expect(sectionSummary.legacyLeadingContentWrapperCount).toBe(0);
    expect(sectionSummary.labelCount).toBe(
      sectionSummary.lightweightParamLabelCount,
    );
  }

  await page
    .locator(`[id="${TARGET_ROW_ID}"] .section-key`)
    .click({ force: true });
  await expect(page.locator(`#${TARGET_EDITOR_ID}`)).toBeVisible();
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
