import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandNodeInternalsState,
} from "state/definitions";
import {
  getKwargsControlsHeightKey,
  getPinnedParamsAreaHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import { shallow } from "zustand/shallow";
import { containerStyle } from "../styles";
import {
  buildSectionShellBackdropScene,
  expandSectionShellBackdropBounds,
  paintSectionShellBackdrop,
} from "./sectionShellBackdrop";
import {
  measureSectionRelativeGraphSpaceRect,
  normalizeViewportScale,
  toGraphSpaceLength,
} from "./sectionShellBackdropMeasurementMath";
import {
  BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CANVAS_OWNED_SECTION_SHELL_ID,
  CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  isCanvasOwnedSectionMotionHiddenBody,
  isCanvasOwnedSectionRestingTextSection,
  isCanvasOwnedSectionShell,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";
import { useReactFlow } from "../store";

const SHELL_BACKDROP_PADDING_PX = 24;
const CALLABLE_TOOLBAR_CORNER_RADIUS_PX = 12;
const SWITCH_TRACK_ATTRIBUTE = "data-canvas-owned-switch-track";
const SWITCH_THUMB_ATTRIBUTE = "data-canvas-owned-switch-thumb";
const CANVAS_OWNED_NESTED_GUIDE_ATTRIBUTE = "data-canvas-owned-nested-guide";
const CANVAS_OWNED_NESTED_GUIDE_LIGHTWEIGHT_ATTRIBUTE =
  "data-canvas-owned-nested-guide-lightweight";
const CANVAS_OWNED_RESTING_DROPDOWN_BOX_ATTRIBUTE =
  "data-canvas-owned-resting-dropdown-box";
const CANVAS_OWNED_UNDERLINE_ATTRIBUTE = "data-canvas-owned-underline";
const CANVAS_OWNED_RESTING_TEXT_ATTRIBUTE = "data-canvas-owned-resting-text";
const CANVAS_OWNED_FILTER_ICON_ATTRIBUTE = "data-canvas-owned-filter-icon";
const FILTER_ICON_BASE_BAR_WIDTH_PX = 8;
const FILTER_ICON_BAR_HEIGHT_PX = 2;
const FILTER_ICON_TOP_BAR_WIDTH_PX = 12;
const FILTER_ICON_TOP_BAR_OFFSET_X_PX = -2;
const FILTER_ICON_TOP_BAR_OFFSET_Y_PX = -4;
const FILTER_ICON_BOTTOM_BAR_WIDTH_PX = 4;
const FILTER_ICON_BOTTOM_BAR_OFFSET_X_PX = 2;
const FILTER_ICON_BOTTOM_BAR_OFFSET_Y_PX = 4;
const LIGHTWEIGHT_NESTED_GUIDE_WIDTH_REM = 0.4;
const LIGHTWEIGHT_NESTED_GUIDE_BOTTOM_OFFSET_REM = 0.1;
const LIGHTWEIGHT_NESTED_GUIDE_LIGHT_FILL = "hsla(219, 25%, 77%, 0.2)";
const LIGHTWEIGHT_NESTED_GUIDE_DARK_FILL = "hsla(220, 26%, 57%, 0.2)";

type CanvasOwnedSwitchTrackBox = {
  checked: boolean;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedSwitchThumbBox = {
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedUnderlineBox = {
  fill: string;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedRestingDropdownBox = {
  cornerRadius: number;
  fill: string;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedFilterIconBox = {
  fill: string;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedNestedGuideBox = {
  cornerRadius: number;
  fill: string;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

type CanvasOwnedRestingTextLine = {
  fill: string;
  font: string;
  maxWidth: number;
  offsetX: number;
  offsetY: number;
  text: string;
};

type CanvasOwnedSectionBackdropMeasurements = {
  filterIconBoxes: Array<CanvasOwnedFilterIconBox>;
  headerHeight: number;
  kwargsControlsHeight: number;
  nestedGuideBoxes: Array<CanvasOwnedNestedGuideBox>;
  pinnedParamsHeight: number;
  restingDropdownBoxes: Array<CanvasOwnedRestingDropdownBox>;
  restingTextLines: Array<CanvasOwnedRestingTextLine>;
  searchHeight: number;
  styleColor: string | null;
  switchTrackBoxes: Array<CanvasOwnedSwitchTrackBox>;
  switchThumbBoxes: Array<CanvasOwnedSwitchThumbBox>;
  underlineBoxes: Array<CanvasOwnedUnderlineBox>;
};

function normalizeStoredHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : 0;
}

function areSwitchTrackBoxesEqual(
  left: Array<CanvasOwnedSwitchTrackBox>,
  right: Array<CanvasOwnedSwitchTrackBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.checked === rightBox.checked &&
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areSwitchThumbBoxesEqual(
  left: Array<CanvasOwnedSwitchThumbBox>,
  right: Array<CanvasOwnedSwitchThumbBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areCanvasOwnedUnderlineBoxesEqual(
  left: Array<CanvasOwnedUnderlineBox>,
  right: Array<CanvasOwnedUnderlineBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.fill === rightBox.fill &&
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areCanvasOwnedRestingDropdownBoxesEqual(
  left: Array<CanvasOwnedRestingDropdownBox>,
  right: Array<CanvasOwnedRestingDropdownBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.cornerRadius === rightBox.cornerRadius &&
      leftBox.fill === rightBox.fill &&
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areCanvasOwnedFilterIconBoxesEqual(
  left: Array<CanvasOwnedFilterIconBox>,
  right: Array<CanvasOwnedFilterIconBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.fill === rightBox.fill &&
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areCanvasOwnedNestedGuideBoxesEqual(
  left: Array<CanvasOwnedNestedGuideBox>,
  right: Array<CanvasOwnedNestedGuideBox>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftBox, index) => {
    const rightBox = right[index];
    return (
      leftBox.cornerRadius === rightBox.cornerRadius &&
      leftBox.fill === rightBox.fill &&
      leftBox.height === rightBox.height &&
      leftBox.offsetX === rightBox.offsetX &&
      leftBox.offsetY === rightBox.offsetY &&
      leftBox.width === rightBox.width
    );
  });
}

function areCanvasOwnedRestingTextLinesEqual(
  left: Array<CanvasOwnedRestingTextLine>,
  right: Array<CanvasOwnedRestingTextLine>,
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftLine, index) => {
    const rightLine = right[index];
    return (
      leftLine.fill === rightLine.fill &&
      leftLine.font === rightLine.font &&
      leftLine.maxWidth === rightLine.maxWidth &&
      leftLine.offsetX === rightLine.offsetX &&
      leftLine.offsetY === rightLine.offsetY &&
      leftLine.text === rightLine.text
    );
  });
}

function measureCanvasOwnedSwitchTrackBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedSwitchTrackBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(`[${SWITCH_TRACK_ATTRIBUTE}="true"]`),
  )
    .map((switchRoot) => {
      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: switchRoot.getBoundingClientRect(),
        sectionRect,
        viewportScale,
      });
      if (!graphSpaceRect) {
        return null;
      }

      return {
        checked:
          switchRoot.dataset.state === "checked" ||
          switchRoot.getAttribute("aria-checked") === "true",
        height: graphSpaceRect.height,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY,
        width: graphSpaceRect.width,
      };
    })
    .filter(
      (switchTrackBox): switchTrackBox is CanvasOwnedSwitchTrackBox =>
        switchTrackBox !== null,
    );
}

function measureCanvasOwnedSwitchThumbBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedSwitchThumbBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(`[${SWITCH_THUMB_ATTRIBUTE}="true"]`),
  )
    .map((switchThumb) => {
      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: switchThumb.getBoundingClientRect(),
        sectionRect,
        viewportScale,
      });
      if (!graphSpaceRect) {
        return null;
      }

      return {
        height: graphSpaceRect.height,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY,
        width: graphSpaceRect.width,
      };
    })
    .filter(
      (switchThumbBox): switchThumbBox is CanvasOwnedSwitchThumbBox =>
        switchThumbBox !== null,
    );
}

function measureCanvasOwnedUnderlineBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedUnderlineBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(
      `[${CANVAS_OWNED_UNDERLINE_ATTRIBUTE}="true"]`,
    ),
  )
    .map((underlineElement) => {
      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: underlineElement.getBoundingClientRect(),
        sectionRect,
        viewportScale,
      });
      if (!graphSpaceRect) {
        return null;
      }

      const computedStyle = window.getComputedStyle(underlineElement);
      const fill = computedStyle.borderBottomColor.trim();
      const borderBottomWidth = Number.parseFloat(
        computedStyle.borderBottomWidth,
      );
      if (
        fill.length === 0 ||
        !Number.isFinite(borderBottomWidth) ||
        borderBottomWidth <= 0
      ) {
        return null;
      }

      const height = toGraphSpaceLength(borderBottomWidth, viewportScale);
      return {
        fill,
        height,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY + graphSpaceRect.height - height,
        width: graphSpaceRect.width,
      };
    })
    .filter(
      (underlineBox): underlineBox is CanvasOwnedUnderlineBox =>
        underlineBox !== null,
    );
}

function measureCanvasOwnedRestingDropdownBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedRestingDropdownBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(
      `[${CANVAS_OWNED_RESTING_DROPDOWN_BOX_ATTRIBUTE}="true"]`,
    ),
  ).flatMap((dropdownBox) => {
    const rect = dropdownBox.getBoundingClientRect();
    const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
      rect,
      sectionRect,
      viewportScale,
    });
    if (!graphSpaceRect) {
      return [];
    }

    const computedStyle = window.getComputedStyle(dropdownBox);
    const backgroundFill = computedStyle.backgroundColor.trim();
    const borderFill = computedStyle.borderTopColor.trim();
    const borderWidthPx = Number.parseFloat(computedStyle.borderTopWidth);
    const borderRadiusPx = Number.parseFloat(computedStyle.borderTopLeftRadius);
    const borderWidth =
      Number.isFinite(borderWidthPx) && borderWidthPx > 0
        ? toGraphSpaceLength(borderWidthPx, viewportScale)
        : 0;
    const cornerRadius = toGraphSpaceLength(
      Number.isFinite(borderRadiusPx) && borderRadiusPx > 0
        ? Math.min(borderRadiusPx, rect.width / 2, rect.height / 2)
        : Math.min(rect.width, rect.height) / 2,
      viewportScale,
    );
    const boxes: Array<CanvasOwnedRestingDropdownBox> = [];
    const hasVisibleBorder =
      borderFill.length > 0 &&
      borderFill !== "rgba(0, 0, 0, 0)" &&
      borderFill !== "transparent" &&
      borderWidth > 0;
    const hasVisibleBackground =
      backgroundFill.length > 0 &&
      backgroundFill !== "rgba(0, 0, 0, 0)" &&
      backgroundFill !== "transparent";

    if (hasVisibleBorder) {
      boxes.push({
        cornerRadius,
        fill: borderFill,
        height: graphSpaceRect.height,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY,
        width: graphSpaceRect.width,
      });
    }

    if (!hasVisibleBackground) {
      return boxes;
    }

    const innerOffsetX = graphSpaceRect.offsetX + borderWidth;
    const innerOffsetY = graphSpaceRect.offsetY + borderWidth;
    const innerWidth = graphSpaceRect.width - borderWidth * 2;
    const innerHeight = graphSpaceRect.height - borderWidth * 2;
    if (innerWidth <= 0 || innerHeight <= 0) {
      return boxes;
    }

    boxes.push({
      cornerRadius: Math.max(0, cornerRadius - borderWidth),
      fill: backgroundFill,
      height: innerHeight,
      offsetX: innerOffsetX,
      offsetY: innerOffsetY,
      width: innerWidth,
    });

    return boxes;
  });
}

function measureCanvasOwnedFilterIconBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedFilterIconBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(
      `[${CANVAS_OWNED_FILTER_ICON_ATTRIBUTE}="true"]`,
    ),
  ).flatMap((iconElement) => {
    const rect = iconElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }

    const computedStyle = window.getComputedStyle(iconElement);
    const fill = computedStyle.color.trim();
    const scale = rect.width / FILTER_ICON_BASE_BAR_WIDTH_PX;
    if (
      fill.length === 0 ||
      fill === "rgba(0, 0, 0, 0)" ||
      !Number.isFinite(scale) ||
      scale <= 0
    ) {
      return [];
    }

    const barHeight = FILTER_ICON_BAR_HEIGHT_PX * scale;
    const barBoxes = [
      {
        height: barHeight,
        left: rect.left + FILTER_ICON_TOP_BAR_OFFSET_X_PX * scale,
        top: rect.top + FILTER_ICON_TOP_BAR_OFFSET_Y_PX * scale,
        width: FILTER_ICON_TOP_BAR_WIDTH_PX * scale,
      },
      {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      {
        height: barHeight,
        left: rect.left + FILTER_ICON_BOTTOM_BAR_OFFSET_X_PX * scale,
        top: rect.top + FILTER_ICON_BOTTOM_BAR_OFFSET_Y_PX * scale,
        width: FILTER_ICON_BOTTOM_BAR_WIDTH_PX * scale,
      },
    ];

    return barBoxes
      .map((barBox) => {
        const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
          rect: {
            height: barBox.height,
            left: barBox.left,
            top: barBox.top,
            width: barBox.width,
          },
          sectionRect,
          viewportScale,
        });
        if (!graphSpaceRect) {
          return null;
        }

        return {
          fill,
          height: graphSpaceRect.height,
          offsetX: graphSpaceRect.offsetX,
          offsetY: graphSpaceRect.offsetY,
          width: graphSpaceRect.width,
        };
      })
      .filter(
        (barBox): barBox is CanvasOwnedFilterIconBox => barBox !== null,
      );
  });
}

function measureCanvasOwnedNestedGuideBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedNestedGuideBox> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(
      `[${CANVAS_OWNED_NESTED_GUIDE_ATTRIBUTE}="true"]`,
    ),
  )
    .map((guideElement) => {
      if (
        guideElement.getAttribute(
          CANVAS_OWNED_NESTED_GUIDE_LIGHTWEIGHT_ATTRIBUTE,
        ) === "true"
      ) {
        const directChildRows = Array.from(guideElement.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            child.tagName === "ARTICLE" &&
            child.dataset.paramRow === "true",
        );
        if (directChildRows.length === 0) {
          return null;
        }

        const topPx = Math.min(
          ...directChildRows.map((childRow) => childRow.getBoundingClientRect().top),
        );
        const bottomPx = Math.max(
          ...directChildRows.map(
            (childRow) => childRow.getBoundingClientRect().bottom,
          ),
        );
        const rootFontSizePx = Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        );
        const remSizePx =
          Number.isFinite(rootFontSizePx) && rootFontSizePx > 0
            ? rootFontSizePx
            : 16;
        const widthPx = remSizePx * LIGHTWEIGHT_NESTED_GUIDE_WIDTH_REM;
        const bottomOffsetPx =
          remSizePx * LIGHTWEIGHT_NESTED_GUIDE_BOTTOM_OFFSET_REM;
        const heightPx = bottomPx - topPx - bottomOffsetPx;
        if (!Number.isFinite(heightPx) || heightPx <= 0) {
          return null;
        }

        const guideRootRect = guideElement.getBoundingClientRect();
        const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
          rect: {
            height: heightPx,
            left: guideRootRect.left,
            top: topPx,
            width: widthPx,
          },
          sectionRect,
          viewportScale,
        });
        if (!graphSpaceRect) {
          return null;
        }

        const fill = document.documentElement.classList.contains("dark")
          ? LIGHTWEIGHT_NESTED_GUIDE_DARK_FILL
          : LIGHTWEIGHT_NESTED_GUIDE_LIGHT_FILL;
        return {
          cornerRadius: toGraphSpaceLength(widthPx / 2, viewportScale),
          fill,
          height: graphSpaceRect.height,
          offsetX: graphSpaceRect.offsetX,
          offsetY: graphSpaceRect.offsetY,
          width: graphSpaceRect.width,
        };
      }

      const guideRect = guideElement.getBoundingClientRect();
      if (guideRect.width <= 0 || guideRect.height <= 0) {
        return null;
      }

      const beforeStyle = window.getComputedStyle(guideElement, "::before");
      const fill = beforeStyle.backgroundColor.trim();
      const heightPx = Number.parseFloat(beforeStyle.height);
      const widthPx = Number.parseFloat(beforeStyle.width);
      if (
        fill.length === 0 ||
        fill === "rgba(0, 0, 0, 0)" ||
        !Number.isFinite(heightPx) ||
        !Number.isFinite(widthPx) ||
        heightPx <= 0 ||
        widthPx <= 0
      ) {
        return null;
      }

      const leftPx = Number.parseFloat(beforeStyle.left);
      const bottomPx = Number.parseFloat(beforeStyle.bottom);
      const borderRadiusPx = Number.parseFloat(beforeStyle.borderRadius);
      const resolvedLeftPx = Number.isFinite(leftPx) ? leftPx : 0;
      const resolvedBottomPx = Number.isFinite(bottomPx) ? bottomPx : 0;
      const topPx = Math.max(0, guideRect.height - resolvedBottomPx - heightPx);
      const resolvedBorderRadiusPx =
        Number.isFinite(borderRadiusPx) && borderRadiusPx > 0
          ? borderRadiusPx
          : Math.min(widthPx, heightPx) / 2;
      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: {
          height: heightPx,
          left: guideRect.left + resolvedLeftPx,
          top: guideRect.top + topPx,
          width: widthPx,
        },
        sectionRect,
        viewportScale,
      });
      if (!graphSpaceRect) {
        return null;
      }

      return {
        cornerRadius: toGraphSpaceLength(
          Math.min(resolvedBorderRadiusPx, widthPx / 2, heightPx / 2),
          viewportScale,
        ),
        fill,
        height: graphSpaceRect.height,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY,
        width: graphSpaceRect.width,
      };
    })
    .filter(
      (guideBox): guideBox is CanvasOwnedNestedGuideBox => guideBox !== null,
    );
}

function measureCanvasOwnedRestingTextLinesForRoot(
  section: HTMLElement,
  textRoot: HTMLElement,
  viewportScale: number,
): Array<CanvasOwnedRestingTextLine> {
  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  const computedStyle = window.getComputedStyle(textRoot);
  const font = computedStyle.font.trim();
  const fill = computedStyle.color.trim();
  if (font.length === 0 || fill.length === 0) {
    return [];
  }

  const measuredLines = Array.from(
    textRoot.querySelectorAll<HTMLElement>(".cm-line"),
  )
    .map((lineElement) => {
      const text = (lineElement.textContent ?? "").replace(/\u200b/gu, "");
      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: lineElement.getBoundingClientRect(),
        sectionRect,
        viewportScale,
      });
      if (text.length === 0 || !graphSpaceRect) {
        return null;
      }

      return {
        fill,
        font,
        maxWidth: graphSpaceRect.width,
        offsetX: graphSpaceRect.offsetX,
        offsetY: graphSpaceRect.offsetY,
        text,
      };
    })
    .filter((line): line is CanvasOwnedRestingTextLine => line !== null);

  if (measuredLines.length > 0) {
    return measuredLines;
  }

  const text = (textRoot.textContent ?? "").replace(/\u200b/gu, "");
  const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
    rect: textRoot.getBoundingClientRect(),
    sectionRect,
    viewportScale,
  });
  if (text.length === 0 || !graphSpaceRect) {
    return [];
  }

  return [
    {
      fill,
      font,
      maxWidth: graphSpaceRect.width,
      offsetX: graphSpaceRect.offsetX,
      offsetY: graphSpaceRect.offsetY,
      text,
    },
  ];
}

function measureCanvasOwnedRestingTextLines(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedRestingTextLine> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  const section = document.querySelector<HTMLElement>(
    `section[data-section-id="${sectionId}"]`,
  );
  if (!(section instanceof HTMLElement)) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(
      `[${CANVAS_OWNED_RESTING_TEXT_ATTRIBUTE}="true"]`,
    ),
  ).flatMap((textRoot) =>
    measureCanvasOwnedRestingTextLinesForRoot(
      section,
      textRoot,
      viewportScale,
    ),
  );
}

function useCanvasOwnedSwitchTrackBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [switchTrackBoxes, setSwitchTrackBoxes] = useState<
    Array<CanvasOwnedSwitchTrackBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedSwitchTrackBoxes(
        sectionId,
        viewportScale,
      );
      setSwitchTrackBoxes((previousBoxes) =>
        areSwitchTrackBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setSwitchTrackBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const switchRoot of section.querySelectorAll<HTMLElement>(
        `[${SWITCH_TRACK_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(switchRoot);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["aria-checked", "class", "data-state", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return switchTrackBoxes;
}

function useCanvasOwnedSwitchThumbBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [switchThumbBoxes, setSwitchThumbBoxes] = useState<
    Array<CanvasOwnedSwitchThumbBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedSwitchThumbBoxes(
        sectionId,
        viewportScale,
      );
      setSwitchThumbBoxes((previousBoxes) =>
        areSwitchThumbBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setSwitchThumbBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const switchThumb of section.querySelectorAll<HTMLElement>(
        `[${SWITCH_THUMB_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(switchThumb);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["aria-checked", "class", "data-state", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements, viewportScale]);

  return switchThumbBoxes;
}

function useCanvasOwnedUnderlineBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [underlineBoxes, setUnderlineBoxes] = useState<
    Array<CanvasOwnedUnderlineBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedUnderlineBoxes(
        sectionId,
        viewportScale,
      );
      setUnderlineBoxes((previousBoxes) =>
        areCanvasOwnedUnderlineBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setUnderlineBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const underlineElement of section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_UNDERLINE_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(underlineElement);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return underlineBoxes;
}

function useCanvasOwnedRestingDropdownBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [restingDropdownBoxes, setRestingDropdownBoxes] = useState<
    Array<CanvasOwnedRestingDropdownBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedRestingDropdownBoxes(
        sectionId,
        viewportScale,
      );
      setRestingDropdownBoxes((previousBoxes) =>
        areCanvasOwnedRestingDropdownBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setRestingDropdownBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const dropdownBox of section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_RESTING_DROPDOWN_BOX_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(dropdownBox);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return restingDropdownBoxes;
}

function useCanvasOwnedNestedGuideBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [nestedGuideBoxes, setNestedGuideBoxes] = useState<
    Array<CanvasOwnedNestedGuideBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedNestedGuideBoxes(
        sectionId,
        viewportScale,
      );
      setNestedGuideBoxes((previousBoxes) =>
        areCanvasOwnedNestedGuideBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setNestedGuideBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const guideElement of section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_NESTED_GUIDE_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(guideElement);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return nestedGuideBoxes;
}

function useCanvasOwnedFilterIconBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [filterIconBoxes, setFilterIconBoxes] = useState<
    Array<CanvasOwnedFilterIconBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredBoxes = () => {
      const nextBoxes = measureCanvasOwnedFilterIconBoxes(
        sectionId,
        viewportScale,
      );
      setFilterIconBoxes((previousBoxes) =>
        areCanvasOwnedFilterIconBoxesEqual(previousBoxes, nextBoxes)
          ? previousBoxes
          : nextBoxes,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setFilterIconBoxes((previousBoxes) =>
        previousBoxes.length === 0 ? previousBoxes : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredBoxes);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const iconElement of section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_FILTER_ICON_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(iconElement);
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return filterIconBoxes;
}

function useCanvasOwnedRestingTextLines(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  suspendMeasurements: boolean,
) {
  const [restingTextLines, setRestingTextLines] = useState<
    Array<CanvasOwnedRestingTextLine>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (suspendMeasurements) {
      return;
    }

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );

    const updateMeasuredLines = () => {
      const nextLines = measureCanvasOwnedRestingTextLines(
        sectionId,
        viewportScale,
      );
      setRestingTextLines((previousLines) =>
        areCanvasOwnedRestingTextLinesEqual(previousLines, nextLines)
          ? previousLines
          : nextLines,
      );
    };

    if (!(section instanceof HTMLElement)) {
      setRestingTextLines((previousLines) =>
        previousLines.length === 0 ? previousLines : [],
      );
      return;
    }

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredLines);
    };

    const observeMeasuredElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const textRoot of section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_RESTING_TEXT_ATTRIBUTE}="true"]`,
      )) {
        resizeObserver.observe(textRoot);
        for (const lineElement of textRoot.querySelectorAll<HTMLElement>(
          ".cm-line",
        )) {
          resizeObserver.observe(lineElement);
        }
      }
    };

    observeMeasuredElements();
    scheduleMeasure();

    const mutationObserver = new MutationObserver(() => {
      observeMeasuredElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, sectionId, suspendMeasurements]);

  return restingTextLines;
}

function useCanvasOwnedSectionBackdropMeasurements({
  nodeHeight,
  nodeWidth,
  sectionId,
  viewportScale,
}: {
  nodeHeight: number | undefined;
  nodeWidth: number | undefined;
  sectionId: string;
  viewportScale: number;
}): CanvasOwnedSectionBackdropMeasurements {
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const styleColor = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplIfPresent(state, sectionId);
    return typeof impl?.styleColor === "string" ? impl.styleColor : null;
  });
  const {
    headerHeight,
    kwargsControlsHeight,
    pinnedParamsHeight,
    searchHeight,
  } = useTemporaryMiscState(
    (state) => ({
      headerHeight: normalizeStoredHeight(
        state[getSectionHeaderHeightKey(sectionId)],
      ),
      kwargsControlsHeight: normalizeStoredHeight(
        state[getKwargsControlsHeightKey(sectionId)],
      ),
      pinnedParamsHeight: normalizeStoredHeight(
        state[getPinnedParamsAreaHeightKey(sectionId)],
      ),
      searchHeight: normalizeStoredHeight(
        state[getSectionSearchHeightKey(sectionId)],
      ),
    }),
    shallow,
  );
  const stableViewportScale = normalizeViewportScale(viewportScale);
  const layoutRefreshKey = `${nodeWidth ?? 0}:${nodeHeight ?? 0}:${headerHeight}:${kwargsControlsHeight}:${pinnedParamsHeight}:${searchHeight}:${stableViewportScale}`;
  const switchTrackBoxes = useCanvasOwnedSwitchTrackBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const switchThumbBoxes = useCanvasOwnedSwitchThumbBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const underlineBoxes = useCanvasOwnedUnderlineBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const restingDropdownBoxes = useCanvasOwnedRestingDropdownBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const filterIconBoxes = useCanvasOwnedFilterIconBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const nestedGuideBoxes = useCanvasOwnedNestedGuideBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );
  const restingTextLines = useCanvasOwnedRestingTextLines(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    viewportInteractionActive,
  );

  return useMemo(
    () => ({
      filterIconBoxes,
      headerHeight,
      kwargsControlsHeight,
      nestedGuideBoxes,
      pinnedParamsHeight,
      restingDropdownBoxes,
      restingTextLines,
      searchHeight,
      styleColor,
      switchTrackBoxes,
      switchThumbBoxes,
      underlineBoxes,
    }),
    [
      filterIconBoxes,
      headerHeight,
      kwargsControlsHeight,
      nestedGuideBoxes,
      pinnedParamsHeight,
      restingDropdownBoxes,
      restingTextLines,
      searchHeight,
      styleColor,
      switchTrackBoxes,
      switchThumbBoxes,
      underlineBoxes,
    ],
  );
}

export default function SectionShellBackdropCanvas() {
  const nodes = useNodeInternals((state: ZustandNodeInternalsState) => state.x);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const viewportScale = useReactFlow((state) => state.transform[2]);
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const callableNode = nodes.get(CANVAS_OWNED_SECTION_SHELL_ID);
  const dictNode = nodes.get(DICT_CANVAS_OWNED_SECTION_SHELL_ID);
  const globalVariablesNode = nodes.get(
    GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  );
  const sectionSizingPolicyNode = nodes.get(
    SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const drawNode = nodes.get(DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const chatNode = nodes.get(CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const chatWindowingNode = nodes.get(
    CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const dropzoneParamNode = nodes.get(
    DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const shortcutsNode = nodes.get(
    SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const browserNode = nodes.get(BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const spreadsheetNode = nodes.get(
    SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const taskBoardNode = nodes.get(TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const stateMachineStartNode = nodes.get(
    STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const genPythonCodeNode = nodes.get(
    GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const genPythonMetadataNode = nodes.get(
    GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const pluginSectionNode = nodes.get(
    PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const buttonParamNode = nodes.get(
    BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const rotaryParamNode = nodes.get(
    ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const sliderParamNode = nodes.get(
    SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const colorPickerParamNode = nodes.get(
    COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const dropdownParamNode = nodes.get(
    DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const textParamNode = nodes.get(
    TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const switchParamNode = nodes.get(
    SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const passwordParamNode = nodes.get(
    PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const codeParamNode = nodes.get(
    CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const textAreaParamNode = nodes.get(
    TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const nestedParamNode = nodes.get(
    NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const codeSectionNode = nodes.get(CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const dateParamNode = nodes.get(DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const backendNode = nodes.get(BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const guiNode = nodes.get(GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID);
  const promptSectionNode = nodes.get(
    PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  );
  const textBlockNode = nodes.get(TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const timeParamNode = nodes.get(TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID);
  const stateMachineGateNode = nodes.get(
    STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  );
  const callableMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: callableNode?.height,
    nodeWidth: callableNode?.width,
    sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
    viewportScale,
  });
  const dictMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: dictNode?.height,
    nodeWidth: dictNode?.width,
    sectionId: DICT_CANVAS_OWNED_SECTION_SHELL_ID,
    viewportScale,
  });
  const globalVariablesMeasurements = useCanvasOwnedSectionBackdropMeasurements(
    {
      nodeHeight: globalVariablesNode?.height,
      nodeWidth: globalVariablesNode?.width,
      sectionId: GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      viewportScale,
    },
  );
  const sectionSizingPolicyMeasurements =
    useCanvasOwnedSectionBackdropMeasurements({
      nodeHeight: sectionSizingPolicyNode?.height,
      nodeWidth: sectionSizingPolicyNode?.width,
      sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      viewportScale,
    });
  const drawMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: drawNode?.height,
    nodeWidth: drawNode?.width,
    sectionId: DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const chatMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: chatNode?.height,
    nodeWidth: chatNode?.width,
    sectionId: CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const chatWindowingMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: chatWindowingNode?.height,
    nodeWidth: chatWindowingNode?.width,
    sectionId: CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const dropzoneParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: dropzoneParamNode?.height,
    nodeWidth: dropzoneParamNode?.width,
    sectionId: DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const shortcutsMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: shortcutsNode?.height,
    nodeWidth: shortcutsNode?.width,
    sectionId: SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const browserMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: browserNode?.height,
    nodeWidth: browserNode?.width,
    sectionId: BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const spreadsheetMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: spreadsheetNode?.height,
    nodeWidth: spreadsheetNode?.width,
    sectionId: SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const taskBoardMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: taskBoardNode?.height,
    nodeWidth: taskBoardNode?.width,
    sectionId: TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const stateMachineStartMeasurements =
    useCanvasOwnedSectionBackdropMeasurements({
      nodeHeight: stateMachineStartNode?.height,
      nodeWidth: stateMachineStartNode?.width,
      sectionId: STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      viewportScale,
    });
  const genPythonCodeMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: genPythonCodeNode?.height,
    nodeWidth: genPythonCodeNode?.width,
    sectionId: GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const genPythonMetadataMeasurements =
    useCanvasOwnedSectionBackdropMeasurements({
      nodeHeight: genPythonMetadataNode?.height,
      nodeWidth: genPythonMetadataNode?.width,
      sectionId: GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      viewportScale,
    });
  const pluginSectionMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: pluginSectionNode?.height,
    nodeWidth: pluginSectionNode?.width,
    sectionId: PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const buttonParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: buttonParamNode?.height,
    nodeWidth: buttonParamNode?.width,
    sectionId: BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const rotaryParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: rotaryParamNode?.height,
    nodeWidth: rotaryParamNode?.width,
    sectionId: ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const sliderParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: sliderParamNode?.height,
    nodeWidth: sliderParamNode?.width,
    sectionId: SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const colorPickerParamMeasurements =
    useCanvasOwnedSectionBackdropMeasurements({
      nodeHeight: colorPickerParamNode?.height,
      nodeWidth: colorPickerParamNode?.width,
      sectionId: COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      viewportScale,
    });
  const dropdownParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: dropdownParamNode?.height,
    nodeWidth: dropdownParamNode?.width,
    sectionId: DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const textParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: textParamNode?.height,
    nodeWidth: textParamNode?.width,
    sectionId: TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const switchParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: switchParamNode?.height,
    nodeWidth: switchParamNode?.width,
    sectionId: SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const passwordParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: passwordParamNode?.height,
    nodeWidth: passwordParamNode?.width,
    sectionId: PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const codeParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: codeParamNode?.height,
    nodeWidth: codeParamNode?.width,
    sectionId: CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const textAreaParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: textAreaParamNode?.height,
    nodeWidth: textAreaParamNode?.width,
    sectionId: TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const nestedParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: nestedParamNode?.height,
    nodeWidth: nestedParamNode?.width,
    sectionId: NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const codeSectionMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: codeSectionNode?.height,
    nodeWidth: codeSectionNode?.width,
    sectionId: CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const dateParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: dateParamNode?.height,
    nodeWidth: dateParamNode?.width,
    sectionId: DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const backendMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: backendNode?.height,
    nodeWidth: backendNode?.width,
    sectionId: BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const guiMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: guiNode?.height,
    nodeWidth: guiNode?.width,
    sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
    viewportScale,
  });
  const promptSectionMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: promptSectionNode?.height,
    nodeWidth: promptSectionNode?.width,
    sectionId: PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const textBlockMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: textBlockNode?.height,
    nodeWidth: textBlockNode?.width,
    sectionId: TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const timeParamMeasurements = useCanvasOwnedSectionBackdropMeasurements({
    nodeHeight: timeParamNode?.height,
    nodeWidth: timeParamNode?.width,
    sectionId: TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    viewportScale,
  });
  const stateMachineGateMeasurements =
    useCanvasOwnedSectionBackdropMeasurements({
      nodeHeight: stateMachineGateNode?.height,
      nodeWidth: stateMachineGateNode?.width,
      sectionId: STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      viewportScale,
    });
  const backdropMeasurementsBySectionId = useMemo(
    () => ({
      [CANVAS_OWNED_SECTION_SHELL_ID]: callableMeasurements,
      [DICT_CANVAS_OWNED_SECTION_SHELL_ID]: dictMeasurements,
      [GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID]:
        globalVariablesMeasurements,
      [SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        sectionSizingPolicyMeasurements,
      [DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]: drawMeasurements,
      [CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]: chatMeasurements,
      [CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        chatWindowingMeasurements,
      [DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        dropzoneParamMeasurements,
      [SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]: shortcutsMeasurements,
      [BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]: browserMeasurements,
      [SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        spreadsheetMeasurements,
      [TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        taskBoardMeasurements,
      [STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        stateMachineStartMeasurements,
      [GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        genPythonCodeMeasurements,
      [GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        genPythonMetadataMeasurements,
      [PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        pluginSectionMeasurements,
      [BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        buttonParamMeasurements,
      [ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        rotaryParamMeasurements,
      [SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        sliderParamMeasurements,
      [COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        colorPickerParamMeasurements,
      [DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        dropdownParamMeasurements,
      [TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        textParamMeasurements,
      [SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        switchParamMeasurements,
      [PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        passwordParamMeasurements,
      [CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        codeParamMeasurements,
      [TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        textAreaParamMeasurements,
      [NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        nestedParamMeasurements,
      [CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        codeSectionMeasurements,
      [DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        dateParamMeasurements,
      [BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]: backendMeasurements,
      [GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID]: guiMeasurements,
      [PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        promptSectionMeasurements,
      [TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        textBlockMeasurements,
      [TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        timeParamMeasurements,
      [STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID]:
        stateMachineGateMeasurements,
    }),
    [
      callableMeasurements,
      dictMeasurements,
      globalVariablesMeasurements,
      sectionSizingPolicyMeasurements,
      drawMeasurements,
      chatMeasurements,
      chatWindowingMeasurements,
      dropzoneParamMeasurements,
      shortcutsMeasurements,
      browserMeasurements,
      spreadsheetMeasurements,
      taskBoardMeasurements,
      stateMachineStartMeasurements,
      genPythonCodeMeasurements,
      genPythonMetadataMeasurements,
      pluginSectionMeasurements,
      buttonParamMeasurements,
      rotaryParamMeasurements,
      sliderParamMeasurements,
      colorPickerParamMeasurements,
      dropdownParamMeasurements,
      textParamMeasurements,
      switchParamMeasurements,
      passwordParamMeasurements,
      codeParamMeasurements,
      textAreaParamMeasurements,
      nestedParamMeasurements,
      codeSectionMeasurements,
      dateParamMeasurements,
      backendMeasurements,
      guiMeasurements,
      promptSectionMeasurements,
      textBlockMeasurements,
      timeParamMeasurements,
      stateMachineGateMeasurements,
    ],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(
    () =>
      buildSectionShellBackdropScene(nodes.values(), {
        getFrameVisual: (node) => {
          if (
            !isCanvasOwnedSectionShell(node.id) &&
            !isCanvasOwnedSectionRestingTextSection(node.id)
          ) {
            return null;
          }

          const measurements =
            backdropMeasurementsBySectionId[
              node.id as keyof typeof backdropMeasurementsBySectionId
            ];
          if (!measurements) {
            return null;
          }

          const chrome = resolveCanvasOwnedSectionShellChrome({
            darkMode,
            styleColor: measurements.styleColor,
          });
          const shellOwned = isCanvasOwnedSectionShell(node.id);
          const motionShellOwned =
            viewportInteractionActive &&
            isCanvasOwnedSectionMotionHiddenBody(node.id);
          const frameOwned = shellOwned || motionShellOwned;
          const callableToolbarOffsetY =
            measurements.headerHeight + measurements.searchHeight;
          const detailBands: Array<{
            cornerRadius: number;
            divider: string | null;
            fill: string | null;
            height: number;
            offsetY: number;
          }> = [];

          if (
            node.id === CANVAS_OWNED_SECTION_SHELL_ID &&
            measurements.kwargsControlsHeight > 0
          ) {
            detailBands.push({
              cornerRadius: CALLABLE_TOOLBAR_CORNER_RADIUS_PX,
              divider: chrome.callableToolbarDivider,
              fill: chrome.callableToolbarFill,
              height: measurements.kwargsControlsHeight,
              offsetY: callableToolbarOffsetY,
            });
          }
          if (
            node.id === CANVAS_OWNED_SECTION_SHELL_ID &&
            measurements.pinnedParamsHeight > 0
          ) {
            detailBands.push({
              cornerRadius: 0,
              divider: chrome.pinnedParamsDivider,
              fill: chrome.pinnedParamsFill,
              height: measurements.pinnedParamsHeight,
              offsetY:
                callableToolbarOffsetY + measurements.kwargsControlsHeight,
            });
          }

          const detailBoxes = [
            ...measurements.restingDropdownBoxes.map((dropdownBox) => ({
              cornerRadius: dropdownBox.cornerRadius,
              fill: dropdownBox.fill,
              height: dropdownBox.height,
              width: dropdownBox.width,
              x: dropdownBox.offsetX,
              y: dropdownBox.offsetY,
            })),
            ...measurements.filterIconBoxes.map((filterIconBox) => ({
              cornerRadius: filterIconBox.height / 2,
              fill: filterIconBox.fill,
              height: filterIconBox.height,
              width: filterIconBox.width,
              x: filterIconBox.offsetX,
              y: filterIconBox.offsetY,
            })),
            ...measurements.nestedGuideBoxes.map((guideBox) => ({
              cornerRadius: guideBox.cornerRadius,
              fill: guideBox.fill,
              height: guideBox.height,
              width: guideBox.width,
              x: guideBox.offsetX,
              y: guideBox.offsetY,
            })),
            ...measurements.underlineBoxes.map((underlineBox) => ({
              cornerRadius: 0,
              fill: underlineBox.fill,
              height: underlineBox.height,
              width: underlineBox.width,
              x: underlineBox.offsetX,
              y: underlineBox.offsetY,
            })),
            ...measurements.switchTrackBoxes.map((switchTrackBox) => ({
              cornerRadius: switchTrackBox.height / 2,
              fill: switchTrackBox.checked
                ? chrome.switchTrackCheckedFill
                : chrome.switchTrackFill,
              height: switchTrackBox.height,
              width: switchTrackBox.width,
              x: switchTrackBox.offsetX,
              y: switchTrackBox.offsetY,
            })),
            ...measurements.switchThumbBoxes.map((switchThumbBox) => ({
              cornerRadius:
                Math.min(switchThumbBox.height, switchThumbBox.width) / 2,
              fill: chrome.switchThumbFill,
              height: switchThumbBox.height,
              width: switchThumbBox.width,
              x: switchThumbBox.offsetX,
              y: switchThumbBox.offsetY,
            })),
          ];
          const detailTexts = measurements.restingTextLines.map(
            (restingTextLine) => ({
              fill: restingTextLine.fill,
              font: restingTextLine.font,
              maxWidth: restingTextLine.maxWidth,
              text: restingTextLine.text,
              x: restingTextLine.offsetX,
              y: restingTextLine.offsetY,
            }),
          );

          if (!frameOwned) {
            return {
              detailBoxes,
              detailTexts,
            };
          }

          return {
            ...chrome,
            detailBands,
            detailBoxes,
            detailTexts,
            headerHeight: measurements.headerHeight,
          };
        },
      }),
    [
      backdropMeasurementsBySectionId,
      darkMode,
      nodes,
      viewportInteractionActive,
    ],
  );

  const expandedBounds = useMemo(() => {
    return scene.bounds
      ? expandSectionShellBackdropBounds(
          scene.bounds,
          SHELL_BACKDROP_PADDING_PX,
        )
      : null;
  }, [scene.bounds]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || expandedBounds === null) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

    canvas.width = Math.ceil(expandedBounds.width * devicePixelRatio);
    canvas.height = Math.ceil(expandedBounds.height * devicePixelRatio);
    canvas.style.width = `${expandedBounds.width}px`;
    canvas.style.height = `${expandedBounds.height}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    paintSectionShellBackdrop(context, scene, {
      darkMode,
      padding: SHELL_BACKDROP_PADDING_PX,
    });
  }, [darkMode, expandedBounds, scene]);

  if (expandedBounds === null) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="react-flow__section-shell-backdrop"
      style={containerStyle}
    >
      <canvas
        data-testid="react-flow__section-shell-backdrop-canvas"
        ref={canvasRef}
        style={{
          left: `${expandedBounds.x}px`,
          pointerEvents: "none",
          position: "absolute",
          top: `${expandedBounds.y}px`,
        }}
      />
    </div>
  );
}
