import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__shortcuts";
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut";
const TARGET_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const TARGET_INPUT_ID = `${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}-ParamInput`;
const TARGET_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const CLUSTER_TARGETS = [
  {
    minimumLightweightParamLabelCount: 50,
    minimumRowCount: 60,
    sectionId: "settings-section__shortcuts",
  },
  {
    minimumLightweightParamLabelCount: 18,
    minimumRowCount: 20,
    sectionId: "settings-section__gui",
  },
  {
    minimumLightweightParamLabelCount: 16,
    minimumRowCount: 20,
    sectionId: "settings-section__chatSectionDefault",
  },
] as const;

test("canvas shell path uses lightweight param-label roots across the shared owned cluster", async ({
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
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector(
        `section[data-section-id="${sectionId}"]`,
      );
      const row = document.getElementById(rowId);
      return (
        section instanceof HTMLElement &&
        row instanceof HTMLElement &&
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    {
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  const summary = await page.evaluate(
    ({
      clusterTargets,
      inputId,
      rowId,
      sectionId,
    }: {
      clusterTargets: typeof CLUSTER_TARGETS;
      inputId: string;
      rowId: string;
      sectionId: string;
    }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const row = document.getElementById(rowId);
      const label = row?.querySelector<HTMLElement>(".section-key");
      const input = document.getElementById(inputId);
      const node = section?.closest<HTMLElement>(".react-flow__node");
      const viewport = node?.closest<HTMLElement>(".react-flow__viewport");

      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing retained shell canvas");
      }
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(row instanceof HTMLElement)) {
        throw new Error(`Missing row ${rowId}`);
      }
      if (!(label instanceof HTMLElement)) {
        throw new Error(`Missing label for ${rowId}`);
      }
      if (!(input instanceof HTMLElement)) {
        throw new Error(`Missing input ${inputId}`);
      }
      if (!(node instanceof HTMLElement)) {
        throw new Error(`Missing React Flow node for ${sectionId}`);
      }
      if (!(viewport instanceof HTMLElement)) {
        throw new Error(`Missing React Flow viewport for ${sectionId}`);
      }

      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) {
        throw new Error("Missing retained shell canvas context");
      }

      const sectionSummaries = clusterTargets.map((target) => {
        const targetSection = document.querySelector<HTMLElement>(
          `section[data-section-id="${target.sectionId}"]`,
        );
        if (!(targetSection instanceof HTMLElement)) {
          throw new Error(`Missing section ${target.sectionId}`);
        }

        return {
          labelCount: targetSection.querySelectorAll(".section-key").length,
          legacyLeadingContentWrapperCount: targetSection.querySelectorAll(
            '.section-key:not([data-canvas-owned-param-label-lightweight="true"])',
          ).length,
          lightweightParamLabelCount: targetSection.querySelectorAll(
            '[data-canvas-owned-param-label-lightweight="true"]',
          ).length,
          minimumLightweightParamLabelCount: target.minimumLightweightParamLabelCount,
          minimumRowCount: target.minimumRowCount,
          rowCount: targetSection.querySelectorAll(
            'article[id^="ParamContainer-"]',
          ).length,
          sectionId: target.sectionId,
        };
      });

      const labelStyle = window.getComputedStyle(label);
      const nodeTransform = window.getComputedStyle(node).transform;
      const viewportTransform = window.getComputedStyle(viewport).transform;
      const nodeTransformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);
      const viewportTransformMatch = /^matrix\(([^)]+)\)$/.exec(
        viewportTransform,
      );
      if (!nodeTransformMatch || !viewportTransformMatch) {
        throw new Error(
          `Unexpected transforms for ${sectionId}: ${nodeTransform} / ${viewportTransform}`,
        );
      }

      const nodeMatrixParts = nodeTransformMatch[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()));
      const viewportMatrixParts = viewportTransformMatch[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()));
      if (
        nodeMatrixParts.length < 6 ||
        viewportMatrixParts.length < 6 ||
        nodeMatrixParts.some((value) => !Number.isFinite(value)) ||
        viewportMatrixParts.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          `Invalid transforms for ${sectionId}: ${nodeTransform} / ${viewportTransform}`,
        );
      }

      const viewportScale = viewportMatrixParts[0];
      if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
        throw new Error(`Invalid viewport scale for ${sectionId}`);
      }

      const nodeX = nodeMatrixParts[4];
      const nodeY = nodeMatrixParts[5];
      const canvasLeft = Number.parseFloat(canvas.style.left);
      const canvasTop = Number.parseFloat(canvas.style.top);
      const canvasScaleX = canvas.width / canvas.clientWidth;
      const canvasScaleY = canvas.height / canvas.clientHeight;
      const nodeRect = node.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const sectionHeader = section.querySelector<HTMLElement>("header.section-title");

      function sampleCanvasPixel(canvasX: number, canvasY: number) {
        const clampedX = Math.max(
          0,
          Math.min(canvas.width - 1, Math.round(canvasX)),
        );
        const clampedY = Math.max(
          0,
          Math.min(canvas.height - 1, Math.round(canvasY)),
        );
        const [r, g, b, a] = canvasContext.getImageData(
          clampedX,
          clampedY,
          1,
          1,
        ).data;
        return `${r},${g},${b},${a}`;
      }

      function countPixelsDifferentFromReferenceInCanvasRect(
        canvasX: number,
        canvasY: number,
        width: number,
        height: number,
        referencePixel: string,
      ) {
        const clampedLeft = Math.max(
          0,
          Math.min(canvas.width - 1, Math.floor(canvasX)),
        );
        const clampedTop = Math.max(
          0,
          Math.min(canvas.height - 1, Math.floor(canvasY)),
        );
        const clampedWidth = Math.max(
          1,
          Math.min(canvas.width - clampedLeft, Math.ceil(width)),
        );
        const clampedHeight = Math.max(
          1,
          Math.min(canvas.height - clampedTop, Math.ceil(height)),
        );
        const data = canvasContext.getImageData(
          clampedLeft,
          clampedTop,
          clampedWidth,
          clampedHeight,
        ).data;
        let distinctPixelCount = 0;
        for (let index = 0; index < data.length; index += 4) {
          const pixel = `${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`;
          if (pixel !== referencePixel) {
            distinctPixelCount += 1;
          }
        }
        return distinctPixelCount;
      }

      const labelOffsetX = (labelRect.left - nodeRect.left) / viewportScale;
      const labelOffsetY = (labelRect.top - nodeRect.top) / viewportScale;
      const labelWidth = labelRect.width / viewportScale;
      const labelHeight = labelRect.height / viewportScale;
      const bodySampleX =
        (nodeX - canvasLeft + 24 / viewportScale) * canvasScaleX;
      const bodySampleY =
        (nodeY -
          canvasTop +
          ((sectionHeader?.offsetHeight ?? 0) + 32) / viewportScale) *
        canvasScaleY;
      const bodyPixel = sampleCanvasPixel(bodySampleX, bodySampleY);

      return {
        canonicalLabel: {
          distinctPixelCount: countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + labelOffsetX) * canvasScaleX,
            (nodeY - canvasTop + labelOffsetY) * canvasScaleY,
            labelWidth * canvasScaleX,
            labelHeight * canvasScaleY,
            bodyPixel,
          ),
          lightweightOwnershipFlag:
            label.dataset.canvasOwnedParamLabelLightweight ?? null,
          opacity: labelStyle.opacity,
        },
        sectionSummaries,
      };
    },
    {
      clusterTargets: CLUSTER_TARGETS,
      inputId: TARGET_INPUT_ID,
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  await testInfo.attach("lightweight-param-label-cluster-summary", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });

  expect(summary.canonicalLabel.opacity).toBe("0");
  expect(summary.canonicalLabel.lightweightOwnershipFlag).toBe("true");
  expect(summary.canonicalLabel.distinctPixelCount).toBeGreaterThan(0);
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
