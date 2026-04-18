import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";
const TARGET_CONFIG_LANGUAGE_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__configLanguage-ParamInput";
const TARGET_CONFIG_LANGUAGE_EDITOR_ID =
  "CodeMirror-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__configLanguage";
const TARGET_COLUMN_WIDTH_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__columnWidth-ParamInput";
const TARGET_EDGE_INPUT_PARAMS_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeInputParams-ParamInput";
const TARGET_EDGE_OUTPUT_PORTS_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeOutputPorts-ParamInput";
const TARGET_SWITCH_ROW_ID =
  "ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__aspectRatio";

test("canvas shell path owns the resting callable section chrome", async ({
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
    ({ columnWidthInputId, configLanguageInputId, sectionId }) => {
      const edgeInputParams = document.getElementById(
        "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeInputParams-ParamInput",
      );
      const edgeOutputPorts = document.getElementById(
        "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeOutputPorts-ParamInput",
      );
      const header = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"] header.section-title`,
      );
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      return (
        document.querySelector(`section[data-section-id="${sectionId}"]`) !==
          null &&
        document.getElementById(`${sectionId}-CustomResizable`) !== null &&
        document.getElementById(columnWidthInputId) !== null &&
        document.getElementById(configLanguageInputId) !== null &&
        edgeInputParams !== null &&
        edgeOutputPorts !== null &&
        canvas !== null &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0 &&
        (header?.offsetHeight ?? 0) > 0
      );
    },
    {
      columnWidthInputId: TARGET_COLUMN_WIDTH_INPUT_ID,
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  const shellState = await page.evaluate(
    (
      {
        columnWidthInputId,
        configLanguageInputId,
        edgeInputParamsInputId,
        edgeOutputPortsInputId,
        rowId,
        sectionId,
      },
    ) => {
      const outer = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const inner = document.getElementById(`${sectionId}-CustomResizable`);
      const header = outer?.querySelector<HTMLElement>("header.section-title");
      const kwargsControls = outer?.querySelector<HTMLElement>(".section-args");
      const aspectRatioRow = document.getElementById(rowId);
      const aspectRatioSwitch = aspectRatioRow?.querySelector<HTMLElement>(
        '[data-canvas-owned-switch-track="true"]',
      );
      const configLanguageInput = document.getElementById(
        configLanguageInputId,
      );
      const configLanguageLine =
        configLanguageInput?.querySelector<HTMLElement>(".cm-line") ??
        configLanguageInput;
      const columnWidthInput = document.getElementById(columnWidthInputId);
      const columnWidthLine =
        columnWidthInput?.querySelector<HTMLElement>(".cm-line") ??
        columnWidthInput;
      const edgeInputParamsInput = document.getElementById(
        edgeInputParamsInputId,
      );
      const edgeInputParamsLine =
        edgeInputParamsInput?.querySelector<HTMLElement>(".cm-line") ??
        edgeInputParamsInput;
      const edgeOutputPortsInput = document.getElementById(
        edgeOutputPortsInputId,
      );
      const edgeOutputPortsLine =
        edgeOutputPortsInput?.querySelector<HTMLElement>(".cm-line") ??
        edgeOutputPortsInput;
      const node = outer?.closest<HTMLElement>(".react-flow__node");
      const viewport = node?.closest<HTMLElement>(".react-flow__viewport");
      const canvas = document.querySelector(
        ".react-flow__section-shell-backdrop canvas",
      );

      if (!(outer instanceof HTMLElement)) {
        throw new Error(`Missing outer shell for ${sectionId}`);
      }
      if (!(inner instanceof HTMLElement)) {
        throw new Error(`Missing inner shell for ${sectionId}`);
      }
      if (!(header instanceof HTMLElement)) {
        throw new Error(`Missing section header for ${sectionId}`);
      }
      if (!(kwargsControls instanceof HTMLElement)) {
        throw new Error(`Missing callable toolbar for ${sectionId}`);
      }
      if (!(aspectRatioRow instanceof HTMLElement)) {
        throw new Error(`Missing Aspect Ratio row for ${sectionId}`);
      }
      if (!(aspectRatioSwitch instanceof HTMLElement)) {
        throw new Error(`Missing Aspect Ratio switch for ${sectionId}`);
      }
      if (!(configLanguageInput instanceof HTMLElement)) {
        throw new Error(`Missing Config Language input for ${sectionId}`);
      }
      if (!(configLanguageLine instanceof HTMLElement)) {
        throw new Error(`Missing Config Language line for ${sectionId}`);
      }
      if (!(columnWidthInput instanceof HTMLElement)) {
        throw new Error(`Missing Column Width input for ${sectionId}`);
      }
      if (!(columnWidthLine instanceof HTMLElement)) {
        throw new Error(`Missing Column Width line for ${sectionId}`);
      }
      if (!(edgeInputParamsInput instanceof HTMLElement)) {
        throw new Error(`Missing Edge Input Params input for ${sectionId}`);
      }
      if (!(edgeInputParamsLine instanceof HTMLElement)) {
        throw new Error(`Missing Edge Input Params line for ${sectionId}`);
      }
      if (!(edgeOutputPortsInput instanceof HTMLElement)) {
        throw new Error(`Missing Edge Output Ports input for ${sectionId}`);
      }
      if (!(edgeOutputPortsLine instanceof HTMLElement)) {
        throw new Error(`Missing Edge Output Ports line for ${sectionId}`);
      }
      if (!(node instanceof HTMLElement)) {
        throw new Error(`Missing React Flow node wrapper for ${sectionId}`);
      }
      if (!(viewport instanceof HTMLElement)) {
        throw new Error(`Missing React Flow viewport for ${sectionId}`);
      }
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Missing retained shell canvas");
      }

      const outerStyle = window.getComputedStyle(outer);
      const innerStyle = window.getComputedStyle(inner);
      const innerBeforeStyle = window.getComputedStyle(inner, "::before");
      const canvasContext = canvas.getContext("2d");

      if (!canvasContext) {
        throw new Error("Missing retained shell canvas context");
      }

      const nodeTransform = window.getComputedStyle(node).transform;
      const viewportTransform = window.getComputedStyle(viewport).transform;
      const nodeTransformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);
      const viewportTransformMatch = /^matrix\(([^)]+)\)$/.exec(
        viewportTransform,
      );

      if (!nodeTransformMatch) {
        throw new Error(
          `Unexpected node transform for ${sectionId}: ${nodeTransform}`,
        );
      }
      if (!viewportTransformMatch) {
        throw new Error(
          `Unexpected viewport transform for ${sectionId}: ${viewportTransform}`,
        );
      }

      const [, nodeTransformBody] = nodeTransformMatch;
      const nodeMatrixParts = nodeTransformBody
        .split(",")
        .map((value) => Number.parseFloat(value.trim()));
      const [, viewportTransformBody] = viewportTransformMatch;
      const viewportMatrixParts = viewportTransformBody
        .split(",")
        .map((value) => Number.parseFloat(value.trim()));

      if (
        nodeMatrixParts.length < 6 ||
        nodeMatrixParts.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          `Invalid node transform matrix for ${sectionId}: ${nodeTransform}`,
        );
      }
      if (
        viewportMatrixParts.length < 6 ||
        viewportMatrixParts.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          `Invalid viewport transform matrix for ${sectionId}: ${viewportTransform}`,
        );
      }

      const viewportScale = viewportMatrixParts[0];
      if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
        throw new Error(
          `Invalid viewport scale for ${sectionId}: ${viewportTransform}`,
        );
      }

      const nodeX = nodeMatrixParts[4];
      const nodeY = nodeMatrixParts[5];
      const canvasLeft = Number.parseFloat(canvas.style.left);
      const canvasTop = Number.parseFloat(canvas.style.top);
      const canvasScaleX = canvas.width / canvas.clientWidth;
      const canvasScaleY = canvas.height / canvas.clientHeight;
      const nodeRect = node.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const kwargsRect = kwargsControls.getBoundingClientRect();
      const aspectRatioSwitchRect = aspectRatioSwitch.getBoundingClientRect();
      const configLanguageRect = configLanguageLine.getBoundingClientRect();
      const headerOffsetX = (headerRect.left - nodeRect.left) / viewportScale;
      const headerOffsetY = (headerRect.top - nodeRect.top) / viewportScale;
      const headerWidth = headerRect.width / viewportScale;
      const headerHeight = headerRect.height / viewportScale;
      const kwargsOffsetX = (kwargsRect.left - nodeRect.left) / viewportScale;
      const kwargsOffsetY = (kwargsRect.top - nodeRect.top) / viewportScale;
      const kwargsWidth = kwargsRect.width / viewportScale;
      const kwargsHeight = kwargsRect.height / viewportScale;
      const headerSampleX =
        (nodeX - canvasLeft + headerOffsetX + headerWidth * 0.5) * canvasScaleX;
      const headerSampleY =
        (nodeY - canvasTop + headerOffsetY + headerHeight * 0.5) * canvasScaleY;
      const bodySampleX =
        (nodeX -
          canvasLeft +
          Math.min(inner.offsetWidth * 0.6, inner.offsetWidth - 24)) *
        canvasScaleX;
      const bodySampleY =
        (nodeY -
          canvasTop +
          Math.min(
            inner.offsetHeight - 24,
            kwargsOffsetY + kwargsHeight + 24,
          )) *
        canvasScaleY;
      const kwargsSampleX =
        (nodeX - canvasLeft + kwargsOffsetX + kwargsWidth * 0.72) *
        canvasScaleX;
      const kwargsSampleY =
        (nodeY - canvasTop + kwargsOffsetY + kwargsHeight * 0.5) * canvasScaleY;
      const aspectRatioSwitchOffsetX =
        (aspectRatioSwitchRect.left - nodeRect.left) / viewportScale;
      const aspectRatioSwitchOffsetY =
        (aspectRatioSwitchRect.top - nodeRect.top) / viewportScale;
      const aspectRatioSwitchWidth =
        aspectRatioSwitchRect.width / viewportScale;
      const aspectRatioSwitchHeight =
        aspectRatioSwitchRect.height / viewportScale;
      const aspectRatioSwitchSampleX =
        (nodeX -
          canvasLeft +
          aspectRatioSwitchOffsetX +
          aspectRatioSwitchWidth * 0.5) *
        canvasScaleX;
      const aspectRatioSwitchSampleY =
        (nodeY -
          canvasTop +
          aspectRatioSwitchOffsetY +
          aspectRatioSwitchHeight * 0.5) *
        canvasScaleY;
      const configLanguageOffsetX =
        (configLanguageRect.left - nodeRect.left) / viewportScale;
      const configLanguageOffsetY =
        (configLanguageRect.top - nodeRect.top) / viewportScale;
      const configLanguageWidth = configLanguageRect.width / viewportScale;
      const configLanguageHeight = configLanguageRect.height / viewportScale;
      const columnWidthRect = columnWidthLine.getBoundingClientRect();
      const columnWidthOffsetX =
        (columnWidthRect.left - nodeRect.left) / viewportScale;
      const columnWidthOffsetY =
        (columnWidthRect.top - nodeRect.top) / viewportScale;
      const columnWidthWidth = columnWidthRect.width / viewportScale;
      const columnWidthHeight = columnWidthRect.height / viewportScale;
      const edgeInputParamsRect = edgeInputParamsLine.getBoundingClientRect();
      const edgeInputParamsOffsetX =
        (edgeInputParamsRect.left - nodeRect.left) / viewportScale;
      const edgeInputParamsOffsetY =
        (edgeInputParamsRect.top - nodeRect.top) / viewportScale;
      const edgeInputParamsWidth = edgeInputParamsRect.width / viewportScale;
      const edgeInputParamsHeight = edgeInputParamsRect.height / viewportScale;
      const edgeOutputPortsRect = edgeOutputPortsLine.getBoundingClientRect();
      const edgeOutputPortsOffsetX =
        (edgeOutputPortsRect.left - nodeRect.left) / viewportScale;
      const edgeOutputPortsOffsetY =
        (edgeOutputPortsRect.top - nodeRect.top) / viewportScale;
      const edgeOutputPortsWidth = edgeOutputPortsRect.width / viewportScale;
      const edgeOutputPortsHeight = edgeOutputPortsRect.height / viewportScale;

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

      const kwargsStyle = window.getComputedStyle(kwargsControls);
      const aspectRatioSwitchStyle = window.getComputedStyle(aspectRatioSwitch);
      const configLanguageStyle = window.getComputedStyle(configLanguageInput);
      const columnWidthStyle = window.getComputedStyle(columnWidthInput);
      const edgeInputParamsStyle = window.getComputedStyle(edgeInputParamsInput);
      const edgeOutputPortsStyle =
        window.getComputedStyle(edgeOutputPortsInput);
      const bodyPixel = sampleCanvasPixel(bodySampleX, bodySampleY);

      return {
        aspectRatioSwitchBackground: aspectRatioSwitchStyle.backgroundColor,
        aspectRatioSwitchOwnershipFlag:
          aspectRatioSwitch.dataset.canvasOwnedSwitchTrack ?? null,
        aspectRatioSwitchPixel: sampleCanvasPixel(
          aspectRatioSwitchSampleX,
          aspectRatioSwitchSampleY,
        ),
        bodyPixel,
        columnWidthDummyOpacity: columnWidthStyle.opacity,
        columnWidthDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + columnWidthOffsetX) * canvasScaleX,
            (nodeY - canvasTop + columnWidthOffsetY) * canvasScaleY,
            columnWidthWidth * canvasScaleX,
            columnWidthHeight * canvasScaleY,
            bodyPixel,
          ),
        edgeInputParamsDummyOpacity: edgeInputParamsStyle.opacity,
        edgeInputParamsDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + edgeInputParamsOffsetX) * canvasScaleX,
            (nodeY - canvasTop + edgeInputParamsOffsetY) * canvasScaleY,
            edgeInputParamsWidth * canvasScaleX,
            edgeInputParamsHeight * canvasScaleY,
            bodyPixel,
          ),
        edgeOutputPortsDummyOpacity: edgeOutputPortsStyle.opacity,
        edgeOutputPortsDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + edgeOutputPortsOffsetX) * canvasScaleX,
            (nodeY - canvasTop + edgeOutputPortsOffsetY) * canvasScaleY,
            edgeOutputPortsWidth * canvasScaleX,
            edgeOutputPortsHeight * canvasScaleY,
            bodyPixel,
          ),
        configLanguageDummyOpacity: configLanguageStyle.opacity,
        configLanguageDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + configLanguageOffsetX) * canvasScaleX,
            (nodeY - canvasTop + configLanguageOffsetY) * canvasScaleY,
            configLanguageWidth * canvasScaleX,
            configLanguageHeight * canvasScaleY,
            bodyPixel,
          ),
        headerHeight,
        headerPixel: sampleCanvasPixel(headerSampleX, headerSampleY),
        kwargsBottomBorderColor: kwargsStyle.borderBottomColor,
        kwargsOwnershipFlag:
          kwargsControls.dataset.canvasOwnedCallableToolbar ?? null,
        kwargsPixel: sampleCanvasPixel(kwargsSampleX, kwargsSampleY),
        kwargsShadow: kwargsStyle.boxShadow,
        kwargsToolbarBackground: kwargsStyle.backgroundColor,
        outerOwnershipFlag: outer.dataset.canvasOwnedShell ?? null,
        innerOwnershipFlag: inner.dataset.canvasOwnedShell ?? null,
        outerBackground: outerStyle.backgroundColor,
        outerBorderColor: outerStyle.borderTopColor,
        innerBackground: innerStyle.backgroundColor,
        innerBeforeBorderWidth: innerBeforeStyle.borderTopWidth,
      };
    },
    {
      columnWidthInputId: TARGET_COLUMN_WIDTH_INPUT_ID,
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      edgeInputParamsInputId: TARGET_EDGE_INPUT_PARAMS_INPUT_ID,
      edgeOutputPortsInputId: TARGET_EDGE_OUTPUT_PORTS_INPUT_ID,
      rowId: TARGET_SWITCH_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(shellState.outerOwnershipFlag).toBe("true");
  expect(shellState.innerOwnershipFlag).toBe("true");
  expect(shellState.outerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.outerBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBeforeBorderWidth).toBe("0px");
  expect(shellState.headerHeight).toBeGreaterThan(0);
  expect(shellState.headerPixel).not.toBe("0,0,0,0");
  expect(shellState.bodyPixel).not.toBe("0,0,0,0");
  expect(shellState.kwargsOwnershipFlag).toBe("true");
  expect(shellState.kwargsToolbarBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.kwargsBottomBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.kwargsShadow).toBe("none");
  expect(shellState.kwargsPixel).not.toBe("0,0,0,0");
  expect(shellState.kwargsPixel).not.toBe(shellState.bodyPixel);
  expect(shellState.aspectRatioSwitchOwnershipFlag).toBe("true");
  expect(shellState.aspectRatioSwitchBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.aspectRatioSwitchPixel).not.toBe("0,0,0,0");
  expect(shellState.aspectRatioSwitchPixel).not.toBe(shellState.bodyPixel);
  expect(shellState.columnWidthDummyOpacity).toBe("0");
  expect(shellState.columnWidthDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.configLanguageDummyOpacity).toBe("0");
  expect(shellState.configLanguageDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.edgeInputParamsDummyOpacity).toBe("0");
  expect(shellState.edgeInputParamsDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.edgeOutputPortsDummyOpacity).toBe("0");
  expect(shellState.edgeOutputPortsDistinctPixelCount).toBeGreaterThan(0);

  const activatedEditor = await page.evaluate((configLanguageInputId) => {
    const configLanguageInput = document.getElementById(configLanguageInputId);
    if (!(configLanguageInput instanceof HTMLElement)) {
      return false;
    }

    const eventInit = {
      bubbles: true,
      button: 0,
      cancelable: true,
    } satisfies MouseEventInit;

    configLanguageInput.dispatchEvent(new MouseEvent("mousedown", eventInit));
    configLanguageInput.dispatchEvent(new MouseEvent("mouseup", eventInit));
    configLanguageInput.dispatchEvent(new MouseEvent("click", eventInit));
    return true;
  }, TARGET_CONFIG_LANGUAGE_INPUT_ID);
  expect(activatedEditor).toBe(true);
  const configLanguageEditor = page.locator(
    `#${TARGET_CONFIG_LANGUAGE_EDITOR_ID}`,
  );
  await expect(configLanguageEditor).toBeVisible();
  await expect(configLanguageEditor).not.toHaveCSS("opacity", "0");
});
