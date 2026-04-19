import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ClusterTarget = {
  expectedLightweightRestingTextCount: number;
  expectedUnderlineCount: number;
  paramInfoId: string;
  sectionId: string;
};

const CLUSTER_TARGETS: ClusterTarget[] = [
  {
    expectedLightweightRestingTextCount: 9,
    expectedUnderlineCount: 9,
    paramInfoId:
      "settings-codeobj__buttonParamCodeObjDefault__buttonParamCodeObjDefault__label",
    sectionId: "settings-section__buttonParamCodeObjDefault",
  },
  {
    expectedLightweightRestingTextCount: 9,
    expectedUnderlineCount: 9,
    paramInfoId:
      "settings-codeobj__codeSectionDefault__codeSectionDefault__codeLanguage",
    sectionId: "settings-section__codeSectionDefault",
  },
  {
    expectedLightweightRestingTextCount: 9,
    expectedUnderlineCount: 9,
    paramInfoId:
      "settings-codeobj__promptSectionDefault__promptSectionDefault__format",
    sectionId: "settings-section__promptSectionDefault",
  },
];

test("canvas shell path owns the code-like shell and resting-text cluster", async ({
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

  const inventories = [];
  for (const target of CLUSTER_TARGETS) {
    const inputId = `${target.sectionId}-${target.paramInfoId}-ParamInput`;
    const editorId = `CodeMirror-${target.sectionId}-${target.paramInfoId}`;
    const targetRowId = `ParamContainer-${target.sectionId}-${target.paramInfoId}`;

    await page.waitForFunction(
      ({ inputId, sectionId, targetRowId }) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".react-flow__section-shell-backdrop canvas",
        );
        const section = document.querySelector(
          `section[data-section-id="${sectionId}"]`,
        );
        const input = document.getElementById(inputId);
        const targetRow = document.getElementById(targetRowId);
        return (
          section instanceof HTMLElement &&
          input instanceof HTMLElement &&
          targetRow instanceof HTMLElement &&
          canvas instanceof HTMLCanvasElement &&
          canvas.clientWidth > 0 &&
          canvas.clientHeight > 0 &&
          canvas.width > 0 &&
          canvas.height > 0
        );
      },
      {
        inputId,
        sectionId: target.sectionId,
        targetRowId,
      },
    );

    const restingTextState = await page.evaluate(
      ({
        inputId,
        sectionId,
        targetRowId,
      }) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        const input = document.getElementById(inputId);
        const targetRow = document.getElementById(targetRowId);
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".react-flow__section-shell-backdrop canvas",
        );
        const node = section?.closest<HTMLElement>(".react-flow__node");
        const viewport = node?.closest<HTMLElement>(".react-flow__viewport");

        if (!(section instanceof HTMLElement)) {
          throw new Error(`Missing section ${sectionId}`);
        }
        if (!(input instanceof HTMLElement)) {
          throw new Error(`Missing input ${inputId}`);
        }
        if (!(targetRow instanceof HTMLElement)) {
          throw new Error(`Missing row ${targetRowId}`);
        }
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("Missing retained shell canvas");
        }
        if (!(node instanceof HTMLElement)) {
          throw new Error(`Missing React Flow node wrapper for ${sectionId}`);
        }
        if (!(viewport instanceof HTMLElement)) {
          throw new Error(`Missing React Flow viewport for ${sectionId}`);
        }

        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) {
          throw new Error("Missing retained shell canvas context");
        }

        const inputStyle = window.getComputedStyle(input);
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
        const inputRect = input.getBoundingClientRect();
        const rowRect = targetRow.getBoundingClientRect();
        const sectionHeader =
          section.querySelector<HTMLElement>("header.section-title");

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

        const uniqueParamInputIds = new Set(
          Array.from(section.querySelectorAll<HTMLElement>('[id$="-ParamInput"]'))
            .map((element) => element.id)
            .filter((id) => id.length > 0),
        );
        const inputOffsetX = (inputRect.left - nodeRect.left) / viewportScale;
        const rowOffsetX = (rowRect.left - nodeRect.left) / viewportScale;
        const rowOffsetY = (rowRect.top - nodeRect.top) / viewportScale;
        const rowWidth = rowRect.width / viewportScale;
        const rowHeight = rowRect.height / viewportScale;
        const shell = document.getElementById(`${sectionId}-CustomResizable`);
        if (!(shell instanceof HTMLElement)) {
          throw new Error(`Missing shell ${sectionId}`);
        }
        const sectionStyle = window.getComputedStyle(section);
        const shellStyle = window.getComputedStyle(shell);
        const bodySampleX =
          (nodeX - canvasLeft + 24 / viewportScale) * canvasScaleX;
        const bodySampleY =
          (nodeY -
            canvasTop +
            ((sectionHeader?.offsetHeight ?? 0) + 32) / viewportScale) *
          canvasScaleY;
        const bodyPixel = sampleCanvasPixel(bodySampleX, bodySampleY);
        const headerSampleX =
          (nodeX - canvasLeft + Math.max(24 / viewportScale, inputOffsetX * 0.5)) *
          canvasScaleX;
        const headerSampleY =
          (nodeY -
            canvasTop +
            Math.max(8 / viewportScale, (sectionHeader?.offsetHeight ?? 0) * 0.5)) *
          canvasScaleY;
        const headerPixel = sampleCanvasPixel(headerSampleX, headerSampleY);

        return {
          bodyPixel,
          canvasOwnedRestingTextCount: section.querySelectorAll(
            '[data-canvas-owned-resting-text="true"]',
          ).length,
          dataCanvasOwnedShell: section.dataset.canvasOwnedShell ?? null,
          headerPixel,
          rowDistinctPixelCount: countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + rowOffsetX) * canvasScaleX,
            (nodeY - canvasTop + rowOffsetY) * canvasScaleY,
            rowWidth * canvasScaleX,
            rowHeight * canvasScaleY,
            bodyPixel,
          ),
          inputHighlightSpanCount: input.querySelectorAll(".cm-line span").length,
          inputOpacity: inputStyle.opacity,
          lightweightOwnershipFlag:
            input.dataset.canvasOwnedRestingTextLightweight ?? null,
          lightweightRestingTextCount: section.querySelectorAll(
            '[data-canvas-owned-resting-text-lightweight="true"]',
          ).length,
          liveInputCount: section.querySelectorAll("input, textarea, .cm-editor")
            .length,
          resizableCanvasOwnedShell: shell.dataset.canvasOwnedShell ?? null,
          sectionBackgroundColor: sectionStyle.backgroundColor,
          shellBackgroundColor: shellStyle.backgroundColor,
          underlineCount: section.querySelectorAll(
            '[data-canvas-owned-underline="true"]',
          ).length,
          uniqueParamInputCount: uniqueParamInputIds.size,
        };
      },
      {
        inputId,
        sectionId: target.sectionId,
        targetRowId,
      },
    );

    expect(restingTextState.uniqueParamInputCount).toBe(
      target.expectedLightweightRestingTextCount,
    );
    expect(restingTextState.lightweightRestingTextCount).toBe(
      target.expectedLightweightRestingTextCount,
    );
    expect(restingTextState.underlineCount).toBe(target.expectedUnderlineCount);
    expect(restingTextState.liveInputCount).toBe(0);
    expect(restingTextState.inputOpacity).toBe("0");
    expect(restingTextState.lightweightOwnershipFlag).toBe("true");
    expect(restingTextState.inputHighlightSpanCount).toBe(0);
    expect(restingTextState.dataCanvasOwnedShell).toBe("true");
    expect(restingTextState.resizableCanvasOwnedShell).toBe("true");
    expect(restingTextState.sectionBackgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(restingTextState.shellBackgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(restingTextState.headerPixel).not.toBe("0,0,0,0");

    inventories.push({
      ...restingTextState,
      inputId,
      sectionId: target.sectionId,
    });

    await page.locator(`#${inputId}`).focus();
    await expect(page.locator(`#${editorId}`)).toHaveCount(1);
  }

  await testInfo.attach("code-like-resting-text-cluster", {
    body: JSON.stringify(inventories, null, 2),
    contentType: "application/json",
  });
  console.log(
    `CODE_LIKE_RESTING_TEXT_CLUSTER ${JSON.stringify(inventories, null, 2)}`,
  );
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
