import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandNodeInternalsState,
} from "state/definitions";
import type { Node as FlowNode } from "../types";
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
  clearCanvasOwnedTextActivators,
  replaceCanvasOwnedTextActivators,
} from "./canvasOwnedTextActivatorRegistry";
import {
  measureSectionRelativeGraphSpaceRect,
  normalizeViewportScale,
  toGraphSpaceLength,
} from "./sectionShellBackdropMeasurementMath";
import {
  BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
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
  isCanvasOwnedSectionLightweightTextUnderline,
  isCanvasOwnedSectionMotionHiddenBody,
  isCanvasOwnedSectionNestedGuide,
  isCanvasOwnedSectionParamFilterIcon,
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
const CANVAS_OWNED_RESTING_TEXT_LIGHTWEIGHT_ATTRIBUTE =
  "data-canvas-owned-resting-text-lightweight";
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

type CanvasOwnedTextActivatorBox = {
  height: number;
  offsetX: number;
  offsetY: number;
  targetId: string;
  width: number;
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
  textActivatorBoxes: Array<CanvasOwnedTextActivatorBox>;
  underlineBoxes: Array<CanvasOwnedUnderlineBox>;
};

type CanvasOwnedSectionBackdropMeasurementPlan = {
  includesCallableDetailBands: boolean;
  measuresFilterIconBoxes: boolean;
  measuresNestedGuideBoxes: boolean;
  measuresRestingDropdownBoxes: boolean;
  measuresRestingTextLines: boolean;
  measuresSwitchBoxes: boolean;
  measuresUnderlineBoxes: boolean;
};

function normalizeStoredHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : 0;
}

function resolveCanvasOwnedBackdropNodeZIndex(node: FlowNode) {
  if (typeof node.tempZIndex === "number" && Number.isFinite(node.tempZIndex)) {
    return node.tempZIndex;
  }
  if (typeof node.zIndex === "number" && Number.isFinite(node.zIndex)) {
    return node.zIndex;
  }
  return 0;
}

function getBackdropNodeFill(node: FlowNode) {
  return typeof node.style?.background === "string" ? node.style.background : null;
}

function areBackdropNodeMapsEqual(
  left: Map<string, FlowNode>,
  right: Map<string, FlowNode>,
) {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }

  for (const [sectionId, leftNode] of left) {
    const rightNode = right.get(sectionId);
    if (!rightNode) {
      return false;
    }
    if (
      leftNode.position.x !== rightNode.position.x ||
      leftNode.position.y !== rightNode.position.y ||
      leftNode.width !== rightNode.width ||
      leftNode.height !== rightNode.height ||
      leftNode.tempZIndex !== rightNode.tempZIndex ||
      leftNode.zIndex !== rightNode.zIndex ||
      getBackdropNodeFill(leftNode) !== getBackdropNodeFill(rightNode)
    ) {
      return false;
    }
  }

  return true;
}

export function resolveCanvasOwnedSectionBackdropMeasurementPlan(
  sectionId: string,
): CanvasOwnedSectionBackdropMeasurementPlan {
  return {
    includesCallableDetailBands: sectionId === CANVAS_OWNED_SECTION_SHELL_ID,
    measuresFilterIconBoxes: isCanvasOwnedSectionParamFilterIcon(sectionId),
    measuresNestedGuideBoxes: isCanvasOwnedSectionNestedGuide(sectionId),
    measuresRestingDropdownBoxes:
      sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
      sectionId === GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID ||
      sectionId === BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID ||
      sectionId === STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
    measuresRestingTextLines: isCanvasOwnedSectionRestingTextSection(sectionId),
    measuresSwitchBoxes: true,
    measuresUnderlineBoxes:
      isCanvasOwnedSectionLightweightTextUnderline(sectionId),
  };
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

function areCanvasOwnedTextActivatorBoxesEqual(
  left: Array<CanvasOwnedTextActivatorBox>,
  right: Array<CanvasOwnedTextActivatorBox>,
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
      leftBox.targetId === rightBox.targetId &&
      leftBox.width === rightBox.width
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

function measureCanvasOwnedTextActivatorBoxes(
  sectionId: string,
  viewportScale: number,
): Array<CanvasOwnedTextActivatorBox> {
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
      `[${CANVAS_OWNED_RESTING_TEXT_LIGHTWEIGHT_ATTRIBUTE}="true"]`,
    ),
  )
    .map((textRoot) => {
      const targetId = textRoot.id.trim();
      if (targetId.length === 0) {
        return null;
      }

      const graphSpaceRect = measureSectionRelativeGraphSpaceRect({
        rect: textRoot.getBoundingClientRect(),
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
        targetId,
        width: graphSpaceRect.width,
      };
    })
    .filter(
      (box): box is CanvasOwnedTextActivatorBox =>
        box !== null && box.width > 0 && box.height > 0,
    );
}

type CanvasOwnedMeasuredArrayHookOptions<T extends Array<unknown>> = {
  areEqual: (left: T, right: T) => boolean;
  createEmptyValue: () => T;
  getObservedElements?: (section: HTMLElement) => Iterable<HTMLElement>;
  layoutRefreshKey: string;
  measure: () => T;
  measurementsEnabled: boolean;
  mutationObserverInit: MutationObserverInit;
  sectionId: string;
  suspendMeasurements: boolean;
};

function useCanvasOwnedMeasuredArray<T extends Array<unknown>>({
  areEqual,
  createEmptyValue,
  getObservedElements = () => [],
  layoutRefreshKey,
  measure,
  measurementsEnabled,
  mutationObserverInit,
  sectionId,
  suspendMeasurements,
}: CanvasOwnedMeasuredArrayHookOptions<T>) {
  const [measuredValue, setMeasuredValue] = useState<T>(() =>
    createEmptyValue(),
  );
  const animationFrameIdRef = useRef(0);
  const areEqualRef = useRef(areEqual);
  const createEmptyValueRef = useRef(createEmptyValue);
  const getObservedElementsRef = useRef(getObservedElements);
  const measureRef = useRef(measure);
  const mutationObserverInitRef = useRef(mutationObserverInit);
  const pendingMeasurementRef = useRef(false);
  const pendingObserverRefreshRef = useRef(false);
  const refreshObservedElementsRef = useRef<(() => void) | null>(null);
  const scheduleMeasurementRef = useRef<(() => void) | null>(null);
  const suspendMeasurementsRef = useRef(suspendMeasurements);

  areEqualRef.current = areEqual;
  createEmptyValueRef.current = createEmptyValue;
  getObservedElementsRef.current = getObservedElements;
  measureRef.current = measure;
  mutationObserverInitRef.current = mutationObserverInit;

  useLayoutEffect(() => {
    suspendMeasurementsRef.current = suspendMeasurements;
    if (!measurementsEnabled) {
      pendingMeasurementRef.current = false;
      pendingObserverRefreshRef.current = false;
      refreshObservedElementsRef.current = null;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = 0;
      }
      return;
    }

    if (suspendMeasurements) {
      pendingMeasurementRef.current =
        pendingMeasurementRef.current || animationFrameIdRef.current !== 0;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = 0;
      }
      return;
    }

    if (pendingObserverRefreshRef.current) {
      pendingObserverRefreshRef.current = false;
      refreshObservedElementsRef.current?.();
    }

    if (pendingMeasurementRef.current) {
      pendingMeasurementRef.current = false;
      scheduleMeasurementRef.current?.();
    }
  }, [measurementsEnabled, suspendMeasurements]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    if (!measurementsEnabled) {
      setMeasuredValue((previousValue) =>
        previousValue.length === 0 ? previousValue : createEmptyValueRef.current(),
      );
      refreshObservedElementsRef.current = null;
      scheduleMeasurementRef.current = null;
      pendingMeasurementRef.current = false;
      pendingObserverRefreshRef.current = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = 0;
      }
      return;
    }

    const clearScheduledMeasurement = () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = 0;
      }
    };

    const runMeasure = () => {
      animationFrameIdRef.current = 0;
      if (suspendMeasurementsRef.current) {
        pendingMeasurementRef.current = true;
        return;
      }

      const nextValue = measureRef.current();
      pendingMeasurementRef.current = false;
      setMeasuredValue((previousValue) =>
        areEqualRef.current(previousValue, nextValue)
          ? previousValue
          : nextValue,
      );
    };

    const scheduleMeasure = () => {
      clearScheduledMeasurement();
      if (suspendMeasurementsRef.current) {
        pendingMeasurementRef.current = true;
        return;
      }
      animationFrameIdRef.current = requestAnimationFrame(runMeasure);
    };

    scheduleMeasurementRef.current = scheduleMeasure;

    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    if (!(section instanceof HTMLElement)) {
      setMeasuredValue((previousValue) =>
        previousValue.length === 0 ? previousValue : createEmptyValueRef.current(),
      );
      return () => {
        if (scheduleMeasurementRef.current === scheduleMeasure) {
          scheduleMeasurementRef.current = null;
        }
        clearScheduledMeasurement();
      };
    }

    let resizeObserver: ResizeObserver | null = null;
    const refreshObservedElements = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(section);
      for (const measuredElement of getObservedElementsRef.current(section)) {
        resizeObserver.observe(measuredElement);
      }
    };

    refreshObservedElementsRef.current = refreshObservedElements;
    refreshObservedElements();
    if (suspendMeasurementsRef.current) {
      pendingMeasurementRef.current = true;
    } else {
      scheduleMeasure();
    }

    const mutationObserver = new MutationObserver(() => {
      if (suspendMeasurementsRef.current) {
        pendingObserverRefreshRef.current = true;
        pendingMeasurementRef.current = true;
        return;
      }

      refreshObservedElements();
      scheduleMeasure();
    });
    mutationObserver.observe(section, mutationObserverInitRef.current);

    return () => {
      if (refreshObservedElementsRef.current === refreshObservedElements) {
        refreshObservedElementsRef.current = null;
      }
      if (scheduleMeasurementRef.current === scheduleMeasure) {
        scheduleMeasurementRef.current = null;
      }
      clearScheduledMeasurement();
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [layoutRefreshKey, measurementsEnabled, sectionId]);

  return measuredValue;
}

function useCanvasOwnedSwitchTrackBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areSwitchTrackBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(`[${SWITCH_TRACK_ATTRIBUTE}="true"]`),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedSwitchTrackBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["aria-checked", "class", "data-state", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedSwitchThumbBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areSwitchThumbBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(`[${SWITCH_THUMB_ATTRIBUTE}="true"]`),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedSwitchThumbBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["aria-checked", "class", "data-state", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedUnderlineBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedUnderlineBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_UNDERLINE_ATTRIBUTE}="true"]`,
      ),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedUnderlineBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedRestingDropdownBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedRestingDropdownBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_RESTING_DROPDOWN_BOX_ATTRIBUTE}="true"]`,
      ),
    layoutRefreshKey,
    measure: () =>
      measureCanvasOwnedRestingDropdownBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedNestedGuideBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedNestedGuideBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_NESTED_GUIDE_ATTRIBUTE}="true"]`,
      ),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedNestedGuideBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedFilterIconBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedFilterIconBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_FILTER_ICON_ATTRIBUTE}="true"]`,
      ),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedFilterIconBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedRestingTextLines(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedRestingTextLinesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      Array.from(
        section.querySelectorAll<HTMLElement>(
          `[${CANVAS_OWNED_RESTING_TEXT_ATTRIBUTE}="true"]`,
        ),
      ).flatMap((textRoot) => [
        textRoot,
        ...Array.from(textRoot.querySelectorAll<HTMLElement>(".cm-line")),
      ]),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedRestingTextLines(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

function useCanvasOwnedTextActivatorBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
  measurementsEnabled: boolean,
  suspendMeasurements: boolean,
) {
  return useCanvasOwnedMeasuredArray({
    areEqual: areCanvasOwnedTextActivatorBoxesEqual,
    createEmptyValue: () => [],
    getObservedElements: (section) =>
      section.querySelectorAll<HTMLElement>(
        `[${CANVAS_OWNED_RESTING_TEXT_LIGHTWEIGHT_ATTRIBUTE}="true"]`,
      ),
    layoutRefreshKey,
    measure: () => measureCanvasOwnedTextActivatorBoxes(sectionId, viewportScale),
    measurementsEnabled,
    mutationObserverInit: {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    },
    sectionId,
    suspendMeasurements,
  });
}

export function useBackdropMeasurementViewportScale(
  viewportInteractionActive: boolean,
) {
  const [measurementViewportScale, setMeasurementViewportScale] = useState(() =>
    normalizeViewportScale(useReactFlow.getState().transform[2]),
  );

  useLayoutEffect(() => {
    const syncMeasurementViewportScale = () => {
      const nextViewportScale = normalizeViewportScale(
        useReactFlow.getState().transform[2],
      );
      setMeasurementViewportScale((previousViewportScale) =>
        previousViewportScale === nextViewportScale
          ? previousViewportScale
          : nextViewportScale,
      );
    };

    syncMeasurementViewportScale();
    if (viewportInteractionActive) {
      return;
    }

    return useReactFlow.subscribe(
      (state) => normalizeViewportScale(state.transform[2]),
      (nextViewportScale, previousViewportScale) => {
        if (nextViewportScale === previousViewportScale) {
          return;
        }
        setMeasurementViewportScale((previousMeasuredViewportScale) =>
          previousMeasuredViewportScale === nextViewportScale
            ? previousMeasuredViewportScale
            : nextViewportScale,
        );
      },
    );
  }, [viewportInteractionActive]);

  return measurementViewportScale;
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
  const measurementPlan =
    resolveCanvasOwnedSectionBackdropMeasurementPlan(sectionId);
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
  } = useTemporaryMiscState((state) => {
    const headerHeight = normalizeStoredHeight(
      state[getSectionHeaderHeightKey(sectionId)],
    );

    if (!measurementPlan.includesCallableDetailBands) {
      return {
        headerHeight,
        kwargsControlsHeight: 0,
        pinnedParamsHeight: 0,
        searchHeight: 0,
      };
    }

    return {
      headerHeight,
      kwargsControlsHeight: normalizeStoredHeight(
        state[getKwargsControlsHeightKey(sectionId)],
      ),
      pinnedParamsHeight: normalizeStoredHeight(
        state[getPinnedParamsAreaHeightKey(sectionId)],
      ),
      searchHeight: normalizeStoredHeight(
        state[getSectionSearchHeightKey(sectionId)],
      ),
    };
  }, shallow);
  const stableViewportScale = normalizeViewportScale(viewportScale);
  const layoutRefreshKey = `${nodeWidth ?? 0}:${nodeHeight ?? 0}:${headerHeight}:${kwargsControlsHeight}:${pinnedParamsHeight}:${searchHeight}:${stableViewportScale}`;
  const switchTrackBoxes = useCanvasOwnedSwitchTrackBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresSwitchBoxes,
    viewportInteractionActive,
  );
  const switchThumbBoxes = useCanvasOwnedSwitchThumbBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresSwitchBoxes,
    viewportInteractionActive,
  );
  const underlineBoxes = useCanvasOwnedUnderlineBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresUnderlineBoxes,
    viewportInteractionActive,
  );
  const restingDropdownBoxes = useCanvasOwnedRestingDropdownBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresRestingDropdownBoxes,
    viewportInteractionActive,
  );
  const filterIconBoxes = useCanvasOwnedFilterIconBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresFilterIconBoxes,
    viewportInteractionActive,
  );
  const nestedGuideBoxes = useCanvasOwnedNestedGuideBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresNestedGuideBoxes,
    viewportInteractionActive,
  );
  const restingTextLines = useCanvasOwnedRestingTextLines(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresRestingTextLines,
    viewportInteractionActive,
  );
  const textActivatorBoxes = useCanvasOwnedTextActivatorBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
    measurementPlan.measuresRestingTextLines,
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
      textActivatorBoxes,
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
      textActivatorBoxes,
      underlineBoxes,
    ],
  );
}

export default function SectionShellBackdropCanvas() {
  const nodes = useNodeInternals(
    (state: ZustandNodeInternalsState) => state.x,
    areBackdropNodeMapsEqual,
  );
  const darkMode = useLocalStorage((state) => state.darkMode);
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const viewportScale = useBackdropMeasurementViewportScale(
    viewportInteractionActive,
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
  const publishedTextActivators = useMemo(
    () =>
      Array.from(nodes.values()).flatMap((node) => {
        if (!isCanvasOwnedSectionRestingTextSection(node.id)) {
          return [];
        }

        const measurements =
          backdropMeasurementsBySectionId[
            node.id as keyof typeof backdropMeasurementsBySectionId
          ];
        if (!measurements || measurements.textActivatorBoxes.length === 0) {
          return [];
        }

        const nodeX = node.position.x;
        const nodeY = node.position.y;
        if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) {
          return [];
        }

        const zIndex = resolveCanvasOwnedBackdropNodeZIndex(node);
        return measurements.textActivatorBoxes.map((box) => ({
          height: box.height,
          sectionId: node.id,
          targetId: box.targetId,
          width: box.width,
          x: nodeX + box.offsetX,
          y: nodeY + box.offsetY,
          zIndex,
        }));
      }),
    [backdropMeasurementsBySectionId, nodes],
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
    replaceCanvasOwnedTextActivators(publishedTextActivators);
  }, [publishedTextActivators]);

  useLayoutEffect(() => {
    return () => {
      clearCanvasOwnedTextActivators();
    };
  }, []);

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
