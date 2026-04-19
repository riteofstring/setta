import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__dictSectionDefault";
const TARGET_CONFIG_LANGUAGE_INPUT_ID =
  "settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__configLanguage-ParamInput";
const TARGET_FILTER_INPUT_ID = "settings-section__dictSectionDefault-args-filter";
const TARGET_STYLE_COLOR_INPUT_ID =
  "settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__styleColor-ParamInput";
const TARGET_STYLE_COLOR_EDITOR_ID =
  "CodeMirror-settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__styleColor";
const TARGET_STYLE_COLOR_ROW_ID =
  "ParamContainer-settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__styleColor";
const TARGET_SIZE_ROW_ID =
  "ParamContainer-settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__size";
const TARGET_SWITCH_ROW_ID =
  "ParamContainer-settings-section__dictSectionDefault-settings-codeobj__dictSectionDefault__dictSectionDefault__aspectRatio";

test("canvas shell path owns shared resting dict section chrome", async ({
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
      configLanguageInputId,
      filterInputId,
      sectionId,
      sizeRowId,
      styleColorInputId,
      styleColorRowId,
    }) => {
      const filterInput = document.getElementById(filterInputId);
      const filterIcon = filterInput
        ?.closest("search")
        ?.querySelector('[data-canvas-owned-filter-icon="true"]');
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const header = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"] header.section-title`,
      );
      return (
        document.querySelector(`section[data-section-id="${sectionId}"]`) !==
          null &&
        document.getElementById(`${sectionId}-CustomResizable`) !== null &&
        document.getElementById(aspectRatioRowId) !== null &&
        document.getElementById(configLanguageInputId) !== null &&
        filterInput !== null &&
        filterIcon !== null &&
        filterInput.closest("search") !== null &&
        document.getElementById(sizeRowId) !== null &&
        document.getElementById(styleColorInputId) !== null &&
        document.getElementById(styleColorRowId) !== null &&
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
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      filterInputId: TARGET_FILTER_INPUT_ID,
      sectionId: TARGET_SECTION_ID,
      sizeRowId: TARGET_SIZE_ROW_ID,
      styleColorInputId: TARGET_STYLE_COLOR_INPUT_ID,
      styleColorRowId: TARGET_STYLE_COLOR_ROW_ID,
    },
  );

  const shellState = await page.evaluate(
    ({
      aspectRatioRowId,
      configLanguageInputId,
      filterInputId,
      sectionId,
      sizeRowId,
      styleColorInputId,
      styleColorRowId,
    }) => {
      const outer = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const inner = document.getElementById(`${sectionId}-CustomResizable`);
      const header = outer?.querySelector<HTMLElement>("header.section-title");
      const filterInput = document.getElementById(filterInputId);
      const filterSearch = filterInput?.closest<HTMLElement>("search");
      const filterIcon = filterSearch?.querySelector<HTMLElement>(
        '[data-canvas-owned-filter-icon="true"]',
      );
      const filterUnderline = filterSearch?.querySelector<HTMLElement>(
        '[data-canvas-owned-underline="true"]',
      );
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
      if (!(filterInput instanceof HTMLElement)) {
        throw new Error(`Missing dict filter input for ${sectionId}`);
      }
      if (!(filterSearch instanceof HTMLElement)) {
        throw new Error(`Missing dict filter container for ${sectionId}`);
      }
      if (!(filterIcon instanceof HTMLElement)) {
        throw new Error(`Missing dict filter icon for ${sectionId}`);
      }
      if (!(filterUnderline instanceof HTMLElement)) {
        throw new Error(`Missing dict filter underline for ${sectionId}`);
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
      const filterRect = filterSearch.getBoundingClientRect();
      const filterIconRect = filterIcon.getBoundingClientRect();
      const filterUnderlineRect = filterUnderline.getBoundingClientRect();
      const aspectRatioSwitchRect = aspectRatioSwitch.getBoundingClientRect();
      const configLanguageRect = configLanguageLine.getBoundingClientRect();
      const styleColorRect = styleColorLine.getBoundingClientRect();
      const styleColorUnderlineRect = styleColorUnderline.getBoundingClientRect();
      const styleColorLabelRect = styleColorLabel.getBoundingClientRect();
      const headerOffsetX = (headerRect.left - nodeRect.left) / viewportScale;
      const headerOffsetY = (headerRect.top - nodeRect.top) / viewportScale;
      const headerWidth = headerRect.width / viewportScale;
      const headerHeight = headerRect.height / viewportScale;
      const filterOffsetY = (filterRect.top - nodeRect.top) / viewportScale;
      const filterHeight = filterRect.height / viewportScale;
      const filterIconBeforeStyle = window.getComputedStyle(
        filterIcon,
        "::before",
      );
      const filterIconAfterStyle = window.getComputedStyle(filterIcon, "::after");
      const filterIconBeforeWidthPx = Number.parseFloat(filterIconBeforeStyle.width);
      const filterIconBeforeHeightPx = Number.parseFloat(
        filterIconBeforeStyle.height,
      );
      const filterIconBeforeLeftPx = Number.parseFloat(filterIconBeforeStyle.left);
      const filterIconBeforeTopPx = Number.parseFloat(filterIconBeforeStyle.top);
      const filterIconAfterWidthPx = Number.parseFloat(filterIconAfterStyle.width);
      const filterIconAfterHeightPx = Number.parseFloat(
        filterIconAfterStyle.height,
      );
      const filterIconAfterLeftPx = Number.parseFloat(filterIconAfterStyle.left);
      const filterIconAfterTopPx = Number.parseFloat(filterIconAfterStyle.top);
      if (
        !Number.isFinite(filterIconBeforeWidthPx) ||
        !Number.isFinite(filterIconBeforeHeightPx) ||
        !Number.isFinite(filterIconBeforeLeftPx) ||
        !Number.isFinite(filterIconBeforeTopPx) ||
        !Number.isFinite(filterIconAfterWidthPx) ||
        !Number.isFinite(filterIconAfterHeightPx) ||
        !Number.isFinite(filterIconAfterLeftPx) ||
        !Number.isFinite(filterIconAfterTopPx)
      ) {
        throw new Error(`Invalid dict filter icon pseudo metrics for ${sectionId}`);
      }
      const filterIconUnionLeft = Math.min(
        filterIconRect.left,
        filterIconRect.left + filterIconBeforeLeftPx,
        filterIconRect.left + filterIconAfterLeftPx,
      );
      const filterIconUnionTop = Math.min(
        filterIconRect.top,
        filterIconRect.top + filterIconBeforeTopPx,
        filterIconRect.top + filterIconAfterTopPx,
      );
      const filterIconUnionRight = Math.max(
        filterIconRect.right,
        filterIconRect.left + filterIconBeforeLeftPx + filterIconBeforeWidthPx,
        filterIconRect.left + filterIconAfterLeftPx + filterIconAfterWidthPx,
      );
      const filterIconUnionBottom = Math.max(
        filterIconRect.bottom,
        filterIconRect.top + filterIconBeforeTopPx + filterIconBeforeHeightPx,
        filterIconRect.top + filterIconAfterTopPx + filterIconAfterHeightPx,
      );
      const filterIconOffsetX =
        (filterIconUnionLeft - nodeRect.left) / viewportScale;
      const filterIconOffsetY =
        (filterIconUnionTop - nodeRect.top) / viewportScale;
      const filterIconWidth =
        (filterIconUnionRight - filterIconUnionLeft) / viewportScale;
      const filterIconHeight =
        (filterIconUnionBottom - filterIconUnionTop) / viewportScale;
      const filterUnderlineOffsetX =
        (filterUnderlineRect.left - nodeRect.left) / viewportScale;
      const filterUnderlineOffsetY =
        (filterUnderlineRect.top - nodeRect.top) / viewportScale;
      const filterUnderlineWidth = filterUnderlineRect.width / viewportScale;
      const filterUnderlineHeight = filterUnderlineRect.height / viewportScale;
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
          Math.min(inner.offsetHeight - 24, filterOffsetY + filterHeight + 24)) *
        canvasScaleY;
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
      const styleColorOffsetX =
        (styleColorRect.left - nodeRect.left) / viewportScale;
      const styleColorOffsetY =
        (styleColorRect.top - nodeRect.top) / viewportScale;
      const styleColorWidth = styleColorRect.width / viewportScale;
      const styleColorHeight = styleColorRect.height / viewportScale;
      const styleColorUnderlineOffsetX =
        (styleColorUnderlineRect.left - nodeRect.left) / viewportScale;
      const styleColorUnderlineOffsetY =
        (styleColorUnderlineRect.top - nodeRect.top) / viewportScale;
      const styleColorUnderlineWidth =
        styleColorUnderlineRect.width / viewportScale;
      const styleColorUnderlineHeight =
        styleColorUnderlineRect.height / viewportScale;
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
        throw new Error(
          `Invalid Size nested guide pseudo metrics for ${sectionId}`,
        );
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

      const aspectRatioSwitchStyle = window.getComputedStyle(aspectRatioSwitch);
      const configLanguageStyle = window.getComputedStyle(configLanguageInput);
      const filterIconStyle = window.getComputedStyle(filterIcon);
      const filterInputStyle = window.getComputedStyle(filterInput);
      const filterUnderlineStyle = window.getComputedStyle(filterUnderline);
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
        filterIconDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + filterIconOffsetX) * canvasScaleX,
            (nodeY - canvasTop + filterIconOffsetY) * canvasScaleY,
            filterIconWidth * canvasScaleX,
            filterIconHeight * canvasScaleY,
            bodyPixel,
          ),
        filterIconOpacity: filterIconStyle.opacity,
        filterIconOwnershipFlag:
          filterIcon.dataset.canvasOwnedFilterIcon ?? null,
        filterUnderlineDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + filterUnderlineOffsetX) * canvasScaleX,
            (nodeY - canvasTop + filterUnderlineOffsetY) * canvasScaleY,
            filterUnderlineWidth * canvasScaleX,
            filterUnderlineHeight * canvasScaleY,
            bodyPixel,
          ),
        filterUnderlineOpacity: filterUnderlineStyle.opacity,
        filterUnderlineOwnershipFlag:
          filterUnderline.dataset.canvasOwnedUnderline ?? null,
        filterInputBorderBottomColor: filterInputStyle.borderBottomColor,
        configLanguageDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + configLanguageOffsetX) * canvasScaleX,
            (nodeY - canvasTop + configLanguageOffsetY) * canvasScaleY,
            configLanguageWidth * canvasScaleX,
            configLanguageHeight * canvasScaleY,
            bodyPixel,
          ),
        configLanguageDummyOpacity: configLanguageStyle.opacity,
        headerHeight,
        headerPixel: sampleCanvasPixel(headerSampleX, headerSampleY),
        innerBackground: innerStyle.backgroundColor,
        innerBeforeBorderWidth: innerBeforeStyle.borderTopWidth,
        innerOwnershipFlag: inner.dataset.canvasOwnedShell ?? null,
        outerBackground: outerStyle.backgroundColor,
        outerBorderColor: outerStyle.borderTopColor,
        outerOwnershipFlag: outer.dataset.canvasOwnedShell ?? null,
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
        styleColorDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + styleColorOffsetX) * canvasScaleX,
            (nodeY - canvasTop + styleColorOffsetY) * canvasScaleY,
            styleColorWidth * canvasScaleX,
            styleColorHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorDummyOpacity: styleColorStyle.opacity,
        styleColorLabelDistinctPixelCount:
          countPixelsDifferentFromReferenceInCanvasRect(
            (nodeX - canvasLeft + styleColorLabelOffsetX) * canvasScaleX,
            (nodeY - canvasTop + styleColorLabelOffsetY) * canvasScaleY,
            styleColorLabelWidth * canvasScaleX,
            styleColorLabelHeight * canvasScaleY,
            bodyPixel,
          ),
        styleColorLabelDummyOpacity: styleColorLabelStyle.opacity,
        styleColorLabelOwnershipFlag:
          styleColorLabel.dataset.canvasOwnedRestingText ?? null,
        styleColorOwnershipFlag:
          styleColorInput.dataset.canvasOwnedRestingText ?? null,
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
      };
    },
    {
      aspectRatioRowId: TARGET_SWITCH_ROW_ID,
      configLanguageInputId: TARGET_CONFIG_LANGUAGE_INPUT_ID,
      filterInputId: TARGET_FILTER_INPUT_ID,
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
  expect(shellState.aspectRatioSwitchOwnershipFlag).toBe("true");
  expect(shellState.aspectRatioSwitchBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.aspectRatioSwitchPixel).not.toBe("0,0,0,0");
  expect(shellState.aspectRatioSwitchPixel).not.toBe(shellState.bodyPixel);
  expect(shellState.filterIconOwnershipFlag).toBe("true");
  expect(shellState.filterIconOpacity).toBe("0");
  expect(shellState.filterIconDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.filterUnderlineOwnershipFlag).toBe("true");
  expect(shellState.filterUnderlineOpacity).toBe("0");
  expect(shellState.filterInputBorderBottomColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.filterUnderlineDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.configLanguageDummyOpacity).toBe("0");
  expect(shellState.configLanguageDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.sizeNestedGuideOwnershipFlag).toBe("true");
  expect(shellState.sizeNestedGuideBeforeOpacity).toBe("0");
  expect(shellState.sizeNestedGuideDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorOwnershipFlag).toBe("true");
  expect(shellState.styleColorDummyOpacity).toBe("0");
  expect(shellState.styleColorDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorUnderlineOwnershipFlag).toBe("true");
  expect(shellState.styleColorUnderlineOpacity).toBe("0");
  expect(shellState.styleColorUnderlineDistinctPixelCount).toBeGreaterThan(0);
  expect(shellState.styleColorLabelOwnershipFlag).toBe("true");
  expect(shellState.styleColorLabelDummyOpacity).toBe("0");
  expect(shellState.styleColorLabelDistinctPixelCount).toBeGreaterThan(0);

  const argsLabelState = await page.evaluate(async (sectionId) => {
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    const inner = document.getElementById(`${sectionId}-CustomResizable`);
    const label = section?.querySelector<HTMLElement>(".section-args h3");
    const node = section?.closest<HTMLElement>(".react-flow__node");
    const viewport = node?.closest<HTMLElement>(".react-flow__viewport");
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".react-flow__section-shell-backdrop canvas",
    );
    if (!(section instanceof HTMLElement)) {
      throw new Error(`Missing section for ${sectionId}`);
    }
    if (!(inner instanceof HTMLElement)) {
      throw new Error(`Missing inner shell for ${sectionId}`);
    }
    if (!(label instanceof HTMLElement)) {
      throw new Error(`Missing Args label for ${sectionId}`);
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

    const nodeTransform = window.getComputedStyle(node).transform;
    const nodeTransformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);
    if (!nodeTransformMatch) {
      throw new Error(
        `Unexpected node transform for ${sectionId}: ${nodeTransform}`,
      );
    }
    const [, nodeTransformBody] = nodeTransformMatch;
    const nodeMatrixParts = nodeTransformBody
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

    const nodeX = nodeMatrixParts[4];
    const nodeY = nodeMatrixParts[5];
    const zoom = 1.3;
    const nextViewportX =
      window.innerWidth / 2 - (nodeX + inner.offsetWidth / 2) * zoom;
    const nextViewportY =
      window.innerHeight / 2 - (nodeY + inner.offsetHeight / 2) * zoom;
    viewport.style.transform = `translate(${nextViewportX}px, ${nextViewportY}px) scale(${zoom})`;
    section.setAttribute("data-codex-force-remeasure", "args-label");
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) {
      throw new Error("Missing retained shell canvas context");
    }

    const viewportTransform = window.getComputedStyle(viewport).transform;
    const viewportTransformMatch = /^matrix\(([^)]+)\)$/.exec(
      viewportTransform,
    );
    if (!viewportTransformMatch) {
      throw new Error(
        `Unexpected viewport transform for ${sectionId}: ${viewportTransform}`,
      );
    }
    const [, viewportTransformBody] = viewportTransformMatch;
    const viewportMatrixParts = viewportTransformBody
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
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

    const canvasLeft = Number.parseFloat(canvas.style.left);
    const canvasTop = Number.parseFloat(canvas.style.top);
    const canvasScaleX = canvas.width / canvas.clientWidth;
    const canvasScaleY = canvas.height / canvas.clientHeight;
    const nodeRect = node.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    if (labelRect.width <= 0 || labelRect.height <= 0) {
      throw new Error(`Args label remained hidden for ${sectionId}`);
    }

    const labelOffsetX = (labelRect.left - nodeRect.left) / viewportScale;
    const labelOffsetY = (labelRect.top - nodeRect.top) / viewportScale;
    const labelWidth = labelRect.width / viewportScale;
    const labelHeight = labelRect.height / viewportScale;
    const bodySampleX =
      (nodeX - canvasLeft + Math.min(inner.offsetWidth * 0.6, inner.offsetWidth - 24)) *
      canvasScaleX;
    const bodySampleY =
      (nodeY - canvasTop + Math.min(inner.offsetHeight - 24, inner.offsetHeight * 0.7)) *
      canvasScaleY;

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

    const bodyPixel = sampleCanvasPixel(bodySampleX, bodySampleY);
    const labelStyle = window.getComputedStyle(label);

    return {
      labelDistinctPixelCount:
        countPixelsDifferentFromReferenceInCanvasRect(
          (nodeX - canvasLeft + labelOffsetX) * canvasScaleX,
          (nodeY - canvasTop + labelOffsetY) * canvasScaleY,
          labelWidth * canvasScaleX,
          labelHeight * canvasScaleY,
          bodyPixel,
        ),
      labelHeight: labelRect.height,
      labelOpacity: labelStyle.opacity,
      labelOwnershipFlag: label.dataset.canvasOwnedRestingText ?? null,
      labelText: label.textContent?.trim() ?? "",
      labelWidth: labelRect.width,
    };
  }, TARGET_SECTION_ID);

  expect(argsLabelState.labelText).toBe("Args");
  expect(argsLabelState.labelWidth).toBeGreaterThan(0);
  expect(argsLabelState.labelHeight).toBeGreaterThan(0);
  expect(argsLabelState.labelOwnershipFlag).toBe("true");
  expect(argsLabelState.labelOpacity).toBe("0");
  expect(argsLabelState.labelDistinctPixelCount).toBeGreaterThan(0);

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
  const styleColorEditor = page.locator(`#${TARGET_STYLE_COLOR_EDITOR_ID}`);
  await expect(styleColorEditor).toBeVisible();
  await expect(styleColorEditor).not.toHaveCSS("opacity", "0");
});
