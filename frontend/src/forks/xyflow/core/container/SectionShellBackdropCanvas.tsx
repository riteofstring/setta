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
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  isCanvasOwnedSectionRestingTextSection,
  isCanvasOwnedSectionShell,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";
import { useReactFlow } from "../store";

const SHELL_BACKDROP_PADDING_PX = 24;
const CALLABLE_TOOLBAR_CORNER_RADIUS_PX = 12;
const SWITCH_TRACK_ATTRIBUTE = "data-canvas-owned-switch-track";
const CANVAS_OWNED_NESTED_GUIDE_ATTRIBUTE = "data-canvas-owned-nested-guide";
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

type CanvasOwnedSwitchTrackBox = {
  checked: boolean;
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
  restingTextLines: Array<CanvasOwnedRestingTextLine>;
  searchHeight: number;
  styleColor: string | null;
  switchTrackBoxes: Array<CanvasOwnedSwitchTrackBox>;
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
) {
  const [switchTrackBoxes, setSwitchTrackBoxes] = useState<
    Array<CanvasOwnedSwitchTrackBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
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
  }, [layoutRefreshKey, sectionId]);

  return switchTrackBoxes;
}

function useCanvasOwnedUnderlineBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
) {
  const [underlineBoxes, setUnderlineBoxes] = useState<
    Array<CanvasOwnedUnderlineBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
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
  }, [layoutRefreshKey, sectionId]);

  return underlineBoxes;
}

function useCanvasOwnedNestedGuideBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
) {
  const [nestedGuideBoxes, setNestedGuideBoxes] = useState<
    Array<CanvasOwnedNestedGuideBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
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
  }, [layoutRefreshKey, sectionId]);

  return nestedGuideBoxes;
}

function useCanvasOwnedFilterIconBoxes(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
) {
  const [filterIconBoxes, setFilterIconBoxes] = useState<
    Array<CanvasOwnedFilterIconBox>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
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
  }, [layoutRefreshKey, sectionId]);

  return filterIconBoxes;
}

function useCanvasOwnedRestingTextLines(
  sectionId: string,
  layoutRefreshKey: string,
  viewportScale: number,
) {
  const [restingTextLines, setRestingTextLines] = useState<
    Array<CanvasOwnedRestingTextLine>
  >([]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
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
  }, [layoutRefreshKey, sectionId]);

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
  );
  const underlineBoxes = useCanvasOwnedUnderlineBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
  );
  const filterIconBoxes = useCanvasOwnedFilterIconBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
  );
  const nestedGuideBoxes = useCanvasOwnedNestedGuideBoxes(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
  );
  const restingTextLines = useCanvasOwnedRestingTextLines(
    sectionId,
    layoutRefreshKey,
    stableViewportScale,
  );

  return useMemo(
    () => ({
      filterIconBoxes,
      headerHeight,
      kwargsControlsHeight,
      nestedGuideBoxes,
      pinnedParamsHeight,
      restingTextLines,
      searchHeight,
      styleColor,
      switchTrackBoxes,
      underlineBoxes,
    }),
    [
      filterIconBoxes,
      headerHeight,
      kwargsControlsHeight,
      nestedGuideBoxes,
      pinnedParamsHeight,
      restingTextLines,
      searchHeight,
      styleColor,
      switchTrackBoxes,
      underlineBoxes,
    ],
  );
}

export default function SectionShellBackdropCanvas() {
  const nodes = useNodeInternals((state: ZustandNodeInternalsState) => state.x);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const viewportScale = useReactFlow((state) => state.transform[2]);
  const callableNode = nodes.get(CANVAS_OWNED_SECTION_SHELL_ID);
  const dictNode = nodes.get(DICT_CANVAS_OWNED_SECTION_SHELL_ID);
  const globalVariablesNode = nodes.get(
    GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  );
  const sectionSizingPolicyNode = nodes.get(
    SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
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
  const backdropMeasurementsBySectionId = useMemo(
    () => ({
      [CANVAS_OWNED_SECTION_SHELL_ID]: callableMeasurements,
      [DICT_CANVAS_OWNED_SECTION_SHELL_ID]: dictMeasurements,
      [GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID]:
        globalVariablesMeasurements,
      [SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID]:
        sectionSizingPolicyMeasurements,
    }),
    [
      callableMeasurements,
      dictMeasurements,
      globalVariablesMeasurements,
      sectionSizingPolicyMeasurements,
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

          if (!shellOwned) {
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
