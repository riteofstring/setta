import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";
const TARGET_CONFIG_LANGUAGE_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__configLanguage-ParamInput";
const TARGET_COLUMN_WIDTH_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__columnWidth-ParamInput";
const TARGET_EDGE_INPUT_PARAMS_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeInputParams-ParamInput";
const TARGET_EDGE_OUTPUT_PORTS_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__edgeOutputPorts-ParamInput";
const TARGET_STYLE_COLOR_INPUT_ID =
  "settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor-ParamInput";
const TARGET_STYLE_COLOR_EDITOR_ID =
  "CodeMirror-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor";
const TARGET_STYLE_COLOR_ROW_ID =
  "ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor";
const TARGET_SIZE_ROW_ID =
  "ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__size";
const TARGET_SIZE_HEIGHT_ROW_ID =
  "ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__size__height";
const TARGET_SIZE_WIDTH_ROW_ID =
  "ParamContainer-settings-section__callableSectionDefault-settings-codeobj__callableSectionDefault__callableSectionDefault__size__width";
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
    ({
      aspectRatioRowId,
      columnWidthInputId,
      configLanguageInputId,
      sectionId,
      sizeHeightRowId,
      sizeRowId,
      sizeWidthRowId,
      styleColorInputId,
      styleColorRowId,
    }) => {
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
        document.getElementById(aspectRatioRowId) !== null &&
        document.getElementById(columnWidthInputId) !== null &&
        document.getElementById(configLanguageInputId) !== null &&
        document.getElementById(sizeRowId) !== null &&
        document.getElementById(sizeHeightRowId) !== null &&
        document.getElementById(sizeWidthRowId) !== null &&
        document.getElementById(styleColorInputId) !== null &&
        document.getElementById(styleColorRowId) !== null &&
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
      aspectRatioRowId: TARGET_SWITCH_ROW_ID,
      columnWidthInputId: TARGET_COLUMN_WIDTH_INPUT_ID,
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
      sizeHeightRowId: TARGET_SIZE_HEIGHT_ROW_ID,
      sizeRowId: TARGET_SIZE_ROW_ID,
      sizeWidthRowId: TARGET_SIZE_WIDTH_ROW_ID,
      styleColorInputId: TARGET_STYLE_COLOR_INPUT_ID,
      styleColorRowId: TARGET_STYLE_COLOR_ROW_ID,
    },
  );

  const shellState = await page.evaluate(
    (
      {
        aspectRatioRowId,
        columnWidthInputId,
        configLanguageInputId,
        edgeInputParamsInputId,
        edgeOutputPortsInputId,
        sectionId,
        sizeRowId,
        styleColorInputId,
        styleColorRowId,
      },
    ) => {
      const outer = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const inner = document.getElementById(`${sectionId}-CustomResizable`);
      const header = outer?.querySelector<HTMLElement>("header.section-title");
      const kwargsControls = outer?.querySelector<HTMLElement>(".section-args");
      const aspectRatioRow = document.getElementById(aspectRatioRowId);
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
      const styleColorInput = document.getElementById(styleColorInputId);
      const styleColorLine =
        styleColorInput?.querySelector<HTMLElement>(".cm-line") ??
        styleColorInput;
      const sizeRow = document.getElementById(sizeRowId);
      const sizeNestedGuide = sizeRow?.querySelector<HTMLElement>(
        '[data-canvas-owned-nested-guide="true"]',
      );
      const styleColorRow = document.getElementById(styleColorRowId);
      const styleColorUnderline = styleColorRow?.querySelector<HTMLElement>(
        '[data-canvas-owned-underline="true"]',
      );
      const styleColorLabel = styleColorRow?.querySelector<HTMLElement>(
        '[data-canvas-owned-resting-text="true"]',
      );
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
      if (!(styleColorInput instanceof HTMLElement)) {
        throw new Error(`Missing Style Color input for ${sectionId}`);
      }
      if (!(styleColorLine instanceof HTMLElement)) {
        throw new Error(`Missing Style Color line for ${sectionId}`);
      }
      if (!(sizeRow instanceof HTMLElement)) {
        throw new Error(`Missing Size row for ${sectionId}`);
      }
      if (!(sizeNestedGuide instanceof HTMLElement)) {
        throw new Error(`Missing Size nested guide for ${sectionId}`);
      }
      if (!(styleColorRow instanceof HTMLElement)) {
        throw new Error(`Missing Style Color row for ${sectionId}`);
      }
      if (!(styleColorUnderline instanceof HTMLElement)) {
        throw new Error(`Missing Style Color underline for ${sectionId}`);
      }
      if (!(styleColorLabel instanceof HTMLElement)) {
        throw new Error(`Missing Style Color label for ${sectionId}`);
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
      const styleColorRect = styleColorLine.getBoundingClientRect();
      const styleColorOffsetX =
        (styleColorRect.left - nodeRect.left) / viewportScale;
      const styleColorOffsetY =
        (styleColorRect.top - nodeRect.top) / viewportScale;
      const styleColorWidth = styleColorRect.width / viewportScale;
      const styleColorHeight = styleColorRect.height / viewportScale;
      const styleColorUnderlineRect = styleColorUnderline.getBoundingClientRect();
      const styleColorUnderlineOffsetX =
        (styleColorUnderlineRect.left - nodeRect.left) / viewportScale;
      const styleColorUnderlineOffsetY =
        (styleColorUnderlineRect.top - nodeRect.top) / viewportScale;
      const styleColorUnderlineWidth =
        styleColorUnderlineRect.width / viewportScale;
      const styleColorUnderlineHeight =
        styleColorUnderlineRect.height / viewportScale;
      const styleColorLabelRect = styleColorLabel.getBoundingClientRect();
      const styleColorLabelOffsetX =
        (styleColorLabelRect.left - nodeRect.left) / viewportScale;
      const styleColorLabelOffsetY =
        (styleColorLabelRect.top - nodeRect.top) / viewportScale;
      const styleColorLabelWidth = styleColorLabelRect.width / viewportScale;
      const styleColorLabelHeight = styleColorLabelRect.height / viewportScale;
      const sizeNestedGuideRect = sizeNestedGuide.getBoundingClientRect();
      const sizeNestedGuideBeforeStyle = window.getComputedStyle(
        sizeNestedGuide,
        "::before",
      );
      const sizeNestedGuideWidthPx = Number.parseFloat(
        sizeNestedGuideBeforeStyle.width,
      );
      const sizeNestedGuideHeightPx = Number.parseFloat(
        sizeNestedGuideBeforeStyle.height,
      );
      const sizeNestedGuideLeftPx = Number.parseFloat(
        sizeNestedGuideBeforeStyle.left,
      );
      const sizeNestedGuideBottomPx = Number.parseFloat(
        sizeNestedGuideBeforeStyle.bottom,
      );
      if (
        !Number.isFinite(sizeNestedGuideWidthPx) ||
        !Number.isFinite(sizeNestedGuideHeightPx) ||
        sizeNestedGuideWidthPx <= 0 ||
        sizeNestedGuideHeightPx <= 0
      ) {
        throw new Error(`Invalid Size nested guide pseudo metrics for ${sectionId}`);
      }
      const sizeNestedGuideOffsetX =
        (sizeNestedGuideRect.left -
          nodeRect.left +
          (Number.isFinite(sizeNestedGuideLeftPx) ? sizeNestedGuideLeftPx : 0)) /
        viewportScale;
      const sizeNestedGuideOffsetY =
        (sizeNestedGuideRect.top -
          nodeRect.top +
          Math.max(
            0,
            sizeNestedGuideRect.height -
              (Number.isFinite(sizeNestedGuideBottomPx)
                ? sizeNestedGuideBottomPx
                : 0) -
              sizeNestedGuideHeightPx,
          )) /
        viewportScale;
      const sizeNestedGuideWidth = sizeNestedGuideWidthPx / viewportScale;
      const sizeNestedGuideHeight = sizeNestedGuideHeightPx / viewportScale;
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
      const styleColorStyle = window.getComputedStyle(styleColorInput);
      const styleColorUnderlineStyle =
        window.getComputedStyle(styleColorUnderline);
      const styleColorLabelStyle = window.getComputedStyle(styleColorLabel);
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
        columnWidthHighlightSpanCount:
          columnWidthInput.querySelectorAll(".cm-line span").length,
        columnWidthLightweightOwnershipFlag:
          columnWidthInput.dataset.canvasOwnedRestingTextLightweight ?? null,
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
        styleColorDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + styleColorOffsetX) * canvasScaleX,
            (nodeY - canvasTop + styleColorOffsetY) * canvasScaleY,
            styleColorWidth * canvasScaleX,
            styleColorHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorLabelDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + styleColorLabelOffsetX) * canvasScaleX,
            (nodeY - canvasTop + styleColorLabelOffsetY) * canvasScaleY,
            styleColorLabelWidth * canvasScaleX,
            styleColorLabelHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorHighlightSpanCount:
          styleColorInput.querySelectorAll(".cm-line span").length,
        styleColorDummyOpacity: styleColorStyle.opacity,
        styleColorLightweightOwnershipFlag:
          styleColorInput.dataset.canvasOwnedRestingTextLightweight ?? null,
        styleColorUnderlineDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + styleColorUnderlineOffsetX) * canvasScaleX,
            (nodeY - canvasTop + styleColorUnderlineOffsetY) * canvasScaleY,
            styleColorUnderlineWidth * canvasScaleX,
            styleColorUnderlineHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorUnderlineOpacity: styleColorUnderlineStyle.opacity,
        styleColorUnderlineOwnershipFlag:
          styleColorUnderline.dataset.canvasOwnedUnderline ?? null,
        styleColorLabelDummyOpacity: styleColorLabelStyle.opacity,
        styleColorLabelOwnershipFlag:
          styleColorLabel.dataset.canvasOwnedRestingText ?? null,
        sizeNestedGuideBeforeOpacity: sizeNestedGuideBeforeStyle.opacity,
        sizeNestedGuideOwnershipFlag:
          sizeNestedGuide.dataset.canvasOwnedNestedGuide ?? null,
        sizeNestedGuideDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + sizeNestedGuideOffsetX) * canvasScaleX,
            (nodeY - canvasTop + sizeNestedGuideOffsetY) * canvasScaleY,
            sizeNestedGuideWidth * canvasScaleX,
            sizeNestedGuideHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorOwnershipFlag:
          styleColorInput.dataset.canvasOwnedRestingText ?? null,
        configLanguageDummyOpacity: configLanguageStyle.opacity,
        configLanguageHighlightSpanCount:
          configLanguageInput.querySelectorAll(".cm-line span").length,
        configLanguageDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + configLanguageOffsetX) * canvasScaleX,
            (nodeY - canvasTop + configLanguageOffsetY) * canvasScaleY,
            configLanguageWidth * canvasScaleX,
            configLanguageHeight * canvasScaleY,
            bodyPixel,
          ),
        configLanguageLightweightOwnershipFlag:
          configLanguageInput.dataset.canvasOwnedRestingTextLightweight ?? null,
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
      aspectRatioRowId: TARGET_SWITCH_ROW_ID,
      columnWidthInputId: TARGET_COLUMN_WIDTH_INPUT_ID,
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      edgeInputParamsInputId: TARGET_EDGE_INPUT_PARAMS_INPUT_ID,
      edgeOutputPortsInputId: TARGET_EDGE_OUTPUT_PORTS_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
      sizeRowId: TARGET_SIZE_ROW_ID,
      styleColorInputId: TARGET_STYLE_COLOR_INPUT_ID,
      styleColorRowId: TARGET_STYLE_COLOR_ROW_ID,
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
  expect(shellState.columnWidthHighlightSpanCount).toBe(0);
  expect(shellState.columnWidthLightweightOwnershipFlag).toBe("true");
  expect(shellState.columnWidthDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.configLanguageDummyOpacity).toBe("0");
  expect(shellState.configLanguageHighlightSpanCount).toBe(0);
  expect(shellState.configLanguageLightweightOwnershipFlag).toBe("true");
  expect(shellState.configLanguageDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.edgeInputParamsDummyOpacity).toBe("0");
  expect(shellState.edgeInputParamsDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.edgeOutputPortsDummyOpacity).toBe("0");
  expect(shellState.edgeOutputPortsDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.sizeNestedGuideOwnershipFlag).toBe("true");
  expect(shellState.sizeNestedGuideBeforeOpacity).toBe("0");
  expect(shellState.sizeNestedGuideDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorOwnershipFlag).toBe("true");
  expect(shellState.styleColorDummyOpacity).toBe("0");
  expect(shellState.styleColorHighlightSpanCount).toBe(0);
  expect(shellState.styleColorLightweightOwnershipFlag).toBe("true");
  expect(shellState.styleColorDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorUnderlineOwnershipFlag).toBe("true");
  expect(shellState.styleColorUnderlineOpacity).toBe("0");
  expect(shellState.styleColorUnderlineDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorLabelOwnershipFlag).toBe("true");
  expect(shellState.styleColorLabelDummyOpacity).toBe("0");
  expect(shellState.styleColorLabelDistinctPixelCount).toBeGreaterThan(0);

  const activatedEditor = await page.evaluate((rowId) => {
    const styleColorLabel = document
      .getElementById(rowId)
      ?.querySelector<HTMLElement>('[data-canvas-owned-resting-text="true"]');
    if (!(styleColorLabel instanceof HTMLElement)) {
      return false;
    }
    styleColorLabel.click();
    return true;
  }, TARGET_STYLE_COLOR_ROW_ID);
  expect(activatedEditor).toBe(true);
  const styleColorEditor = page.locator(
    `#${TARGET_STYLE_COLOR_EDITOR_ID}`,
  );
  await expect(styleColorEditor).toBeVisible();
  await expect(styleColorEditor).not.toHaveCSS("opacity", "0");
});
