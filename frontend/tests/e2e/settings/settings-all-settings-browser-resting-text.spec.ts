import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__browserSectionDefault";
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__browserSectionDefault__browserSectionDefault__columnWidth";
const TARGET_INPUT_ID = `${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}-ParamInput`;
const TARGET_EDITOR_ID = `CodeMirror-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;

test("canvas shell path owns the browser section shell frame and resting text", async ({
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
    () => document.querySelectorAll(".react-flow__node").length > 13,
  );
  await clickFitViewIfVisible(page);

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
      inputId: TARGET_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  const restingTextState = await page.evaluate(
    ({ inputId, sectionId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const shell = document.getElementById(`${sectionId}-CustomResizable`);
      const input = document.getElementById(inputId);
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const node = section?.closest<HTMLElement>(".react-flow__node");
      const viewport = node?.closest<HTMLElement>(".react-flow__viewport");

      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(shell instanceof HTMLElement)) {
        throw new Error(`Missing shell ${sectionId}`);
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
      const textActivators = (
        window as Window & {
          __SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__?: Array<{
            height: number;
            sectionId: string;
            targetId: string;
            width: number;
            x: number;
            y: number;
            zIndex: number;
          }>;
        }
      ).__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__ ?? [];

      const sectionStyle = window.getComputedStyle(section);
      const shellStyle = window.getComputedStyle(shell);
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
      const inputCenterClientX = inputRect.left + inputRect.width * 0.5;
      const inputCenterClientY = inputRect.top + inputRect.height * 0.5;
      const inputCenterX = nodeX + inputOffsetX + inputWidth * 0.5;
      const inputCenterY = nodeY + inputOffsetY + inputHeight * 0.5;
      const textActivator =
        textActivators.find(
          (candidate) =>
            candidate.sectionId === sectionId && candidate.targetId === inputId,
        ) ?? null;
      const clickTarget = document.elementFromPoint(
        inputCenterClientX,
        inputCenterClientY,
      );
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
        dataCanvasOwnedShell: section.dataset.canvasOwnedShell ?? null,
        headerPixel,
        resizableCanvasOwnedShell: shell.dataset.canvasOwnedShell ?? null,
        shellBackgroundColor: shellStyle.backgroundColor,
        sectionBackgroundColor: sectionStyle.backgroundColor,
        inputDistinctPixelCount: countPixelsDifferentFromReferenceInCanvasRect(
          (nodeX - canvasLeft + inputOffsetX) * canvasScaleX,
          (nodeY - canvasTop + inputOffsetY) * canvasScaleY,
          inputWidth * canvasScaleX,
          inputHeight * canvasScaleY,
          "0,0,0,0",
        ),
        inputHighlightSpanCount: input.querySelectorAll(".cm-line span").length,
        inputOpacity: inputStyle.opacity,
        lightweightOwnershipFlag:
          input.dataset.canvasOwnedRestingTextLightweight ?? null,
        paneOwnsInputCenterClick:
          clickTarget instanceof HTMLElement &&
          clickTarget.classList.contains("react-flow__pane"),
        textActivator,
        textActivatorContainsInputCenter: Boolean(
          textActivator &&
            inputCenterX >= textActivator.x &&
            inputCenterX <= textActivator.x + textActivator.width &&
            inputCenterY >= textActivator.y &&
            inputCenterY <= textActivator.y + textActivator.height,
        ),
      };
    },
    {
      inputId: TARGET_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingTextState.dataCanvasOwnedShell).toBe("true");
  expect(restingTextState.inputOpacity).toBe("0");
  expect(restingTextState.lightweightOwnershipFlag).toBe("true");
  expect(restingTextState.inputHighlightSpanCount).toBe(0);
  expect(restingTextState.inputDistinctPixelCount).toBeGreaterThan(0);
  expect(restingTextState.resizableCanvasOwnedShell).toBe("true");
  expect(restingTextState.sectionBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingTextState.shellBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(restingTextState.headerPixel).not.toBe("0,0,0,0");
  expect(restingTextState.textActivator).toMatchObject({
    sectionId: TARGET_SECTION_ID,
    targetId: TARGET_INPUT_ID,
  });
  expect(restingTextState.paneOwnsInputCenterClick).toBe(true);
  expect(restingTextState.textActivatorContainsInputCenter).toBe(true);

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
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}
