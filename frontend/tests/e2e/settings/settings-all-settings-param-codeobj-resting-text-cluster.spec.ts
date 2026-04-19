import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ClusterTarget = {
  expectedMinimumLightweightRestingTextCount: number;
  expectedMinimumUnderlineCount: number;
  paramInfoId: string;
  sectionId: string;
};

const CLUSTER_TARGETS: ClusterTarget[] = [
  {
    expectedMinimumLightweightRestingTextCount: 7,
    expectedMinimumUnderlineCount: 7,
    paramInfoId:
      "settings-codeobj__rotaryParamCodeObjDefault__rotaryParamCodeObjDefault__max",
    sectionId: "settings-section__rotaryParamCodeObjDefault",
  },
  {
    expectedMinimumLightweightRestingTextCount: 7,
    expectedMinimumUnderlineCount: 7,
    paramInfoId:
      "settings-codeobj__sliderParamCodeObjDefault__sliderParamCodeObjDefault__step",
    sectionId: "settings-section__sliderParamCodeObjDefault",
  },
  {
    expectedMinimumLightweightRestingTextCount: 5,
    expectedMinimumUnderlineCount: 5,
    paramInfoId:
      "settings-codeobj__textParamCodeObjDefault__textParamCodeObjDefault__uiType",
    sectionId: "settings-section__textParamCodeObjDefault",
  },
];

test("canvas shell path owns the shared param-codeobj resting-text cluster", async ({
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

    await page.waitForFunction(
      ({ inputId, sectionId }) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".react-flow__section-shell-backdrop canvas",
        );
        const section = document.querySelector(
          `section[data-section-id="${sectionId}"]`,
        );
        const input = document.getElementById(inputId);
        return (
          section instanceof HTMLElement &&
          input instanceof HTMLElement &&
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
      },
    );

    const restingTextState = await page.evaluate(
      ({ inputId, sectionId }) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        const input = document.getElementById(inputId);
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

        const inputOffsetX = (inputRect.left - nodeRect.left) / viewportScale;
        const inputOffsetY = (inputRect.top - nodeRect.top) / viewportScale;
        const inputWidth = inputRect.width / viewportScale;
        const inputHeight = inputRect.height / viewportScale;
        const bodySampleX =
          (nodeX - canvasLeft + 24 / viewportScale) * canvasScaleX;
        const bodySampleY =
          (nodeY -
            canvasTop +
            ((sectionHeader?.offsetHeight ?? 0) + 32) / viewportScale) *
          canvasScaleY;
        const bodyPixel = sampleCanvasPixel(bodySampleX, bodySampleY);

        return {
          bodyPixel,
          inputDistinctPixelCount: countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + inputOffsetX) * canvasScaleX,
            (nodeY - canvasTop + inputOffsetY) * canvasScaleY,
            inputWidth * canvasScaleX,
            inputHeight * canvasScaleY,
            bodyPixel,
          ),
          inputOpacity: inputStyle.opacity,
          lightweightOwnershipFlag:
            input.dataset.canvasOwnedRestingTextLightweight ?? null,
          lightweightRestingTextCount: section.querySelectorAll(
            '[data-canvas-owned-resting-text-lightweight="true"]',
          ).length,
          liveInputCount: section.querySelectorAll("input, textarea, .cm-editor")
            .length,
          underlineCount: section.querySelectorAll(
            '[data-canvas-owned-underline="true"]',
          ).length,
        };
      },
      {
        inputId,
        sectionId: target.sectionId,
      },
    );

    expect(restingTextState.lightweightRestingTextCount).toBeGreaterThanOrEqual(
      target.expectedMinimumLightweightRestingTextCount,
    );
    expect(restingTextState.underlineCount).toBeGreaterThanOrEqual(
      target.expectedMinimumUnderlineCount,
    );
    expect(restingTextState.lightweightOwnershipFlag).toBe("true");
    expect(restingTextState.inputOpacity).toBe("0");
    expect(restingTextState.inputDistinctPixelCount).toBeGreaterThan(0);
    expect(restingTextState.liveInputCount).toBe(0);

    const input = page.locator(`[id="${inputId}"]`);
    const editor = page.locator(`[id="${editorId}"]`);
    await input.focus();
    await expect(editor).toBeVisible();

    inventories.push({
      ...target,
      ...restingTextState,
      editorId,
    });
  }

  await testInfo.attach("param-codeobj-resting-text-cluster", {
    body: JSON.stringify(inventories, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_PARAM_CODEOBJ_RESTING_TEXT_CLUSTER ${JSON.stringify(
      inventories,
      null,
      2,
    )}`,
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
