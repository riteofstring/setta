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
  CANVAS_OWNED_SECTION_SHELL_ID,
  isCanvasOwnedSectionShell,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";

const SHELL_BACKDROP_PADDING_PX = 24;
const CALLABLE_TOOLBAR_CORNER_RADIUS_PX = 12;
const SWITCH_TRACK_ATTRIBUTE = "data-canvas-owned-switch-track";
const CANVAS_OWNED_RESTING_TEXT_ATTRIBUTE = "data-canvas-owned-resting-text";

type CanvasOwnedSwitchTrackBox = {
  checked: boolean;
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

function normalizeStoredHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : 0;
}

function parseViewportScale(transformValue: string | null | undefined): number {
  const transform = transformValue?.trim() ?? "";
  if (transform.length === 0 || transform === "none") {
    return 1;
  }

  const matrixMatch = /^matrix\(([^)]+)\)$/.exec(transform);
  if (matrixMatch) {
    const firstValue = Number.parseFloat(matrixMatch[1].split(",")[0]?.trim());
    return Number.isFinite(firstValue) && firstValue > 0 ? firstValue : 1;
  }

  const matrix3dMatch = /^matrix3d\(([^)]+)\)$/.exec(transform);
  if (matrix3dMatch) {
    const firstValue = Number.parseFloat(
      matrix3dMatch[1].split(",")[0]?.trim(),
    );
    return Number.isFinite(firstValue) && firstValue > 0 ? firstValue : 1;
  }

  return 1;
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

  const viewport = section.closest<HTMLElement>(".react-flow__viewport");
  const viewportScale = parseViewportScale(
    viewport ? window.getComputedStyle(viewport).transform : null,
  );
  const sectionRect = section.getBoundingClientRect();
  if (sectionRect.width <= 0 || sectionRect.height <= 0) {
    return [];
  }

  return Array.from(
    section.querySelectorAll<HTMLElement>(`[${SWITCH_TRACK_ATTRIBUTE}="true"]`),
  )
    .map((switchRoot) => {
      const rect = switchRoot.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return {
        checked:
          switchRoot.dataset.state === "checked" ||
          switchRoot.getAttribute("aria-checked") === "true",
        height: rect.height / viewportScale,
        offsetX: (rect.left - sectionRect.left) / viewportScale,
        offsetY: (rect.top - sectionRect.top) / viewportScale,
        width: rect.width / viewportScale,
      };
    })
    .filter(
      (switchTrackBox): switchTrackBox is CanvasOwnedSwitchTrackBox =>
        switchTrackBox !== null,
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
      const rect = lineElement.getBoundingClientRect();
      if (text.length === 0 || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return {
        fill,
        font,
        maxWidth: rect.width / viewportScale,
        offsetX: (rect.left - sectionRect.left) / viewportScale,
        offsetY: (rect.top - sectionRect.top) / viewportScale,
        text,
      };
    })
    .filter((line): line is CanvasOwnedRestingTextLine => line !== null);

  if (measuredLines.length > 0) {
    return measuredLines;
  }

  const text = (textRoot.textContent ?? "").replace(/\u200b/gu, "");
  const rect = textRoot.getBoundingClientRect();
  if (text.length === 0 || rect.width <= 0 || rect.height <= 0) {
    return [];
  }

  return [
    {
      fill,
      font,
      maxWidth: rect.width / viewportScale,
      offsetX: (rect.left - sectionRect.left) / viewportScale,
      offsetY: (rect.top - sectionRect.top) / viewportScale,
      text,
    },
  ];
}

function measureCanvasOwnedRestingTextLines(
  sectionId: string,
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

  const viewport = section.closest<HTMLElement>(".react-flow__viewport");
  const viewportScale = parseViewportScale(
    viewport ? window.getComputedStyle(viewport).transform : null,
  );

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
      const nextBoxes = measureCanvasOwnedSwitchTrackBoxes(sectionId);
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

function useCanvasOwnedRestingTextLines(
  sectionId: string,
  layoutRefreshKey: string,
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
      const nextLines = measureCanvasOwnedRestingTextLines(sectionId);
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

export default function SectionShellBackdropCanvas() {
  const nodes = useNodeInternals((state: ZustandNodeInternalsState) => state.x);
  const canvasOwnedSectionNode = nodes.get(CANVAS_OWNED_SECTION_SHELL_ID);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const canvasOwnedShellStyleColor = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplIfPresent(
      state,
      CANVAS_OWNED_SECTION_SHELL_ID,
    );
    return typeof impl?.styleColor === "string" ? impl.styleColor : null;
  });
  const {
    canvasOwnedShellHeaderHeight,
    canvasOwnedShellKwargsControlsHeight,
    canvasOwnedShellPinnedParamsHeight,
    canvasOwnedShellSearchHeight,
  } = useTemporaryMiscState(
    (state) => ({
      canvasOwnedShellHeaderHeight: normalizeStoredHeight(
        state[getSectionHeaderHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
      canvasOwnedShellKwargsControlsHeight: normalizeStoredHeight(
        state[getKwargsControlsHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
      canvasOwnedShellPinnedParamsHeight: normalizeStoredHeight(
        state[getPinnedParamsAreaHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
      canvasOwnedShellSearchHeight: normalizeStoredHeight(
        state[getSectionSearchHeightKey(CANVAS_OWNED_SECTION_SHELL_ID)],
      ),
    }),
    shallow,
  );
  const switchTrackBoxes = useCanvasOwnedSwitchTrackBoxes(
    CANVAS_OWNED_SECTION_SHELL_ID,
    `${canvasOwnedSectionNode?.width ?? 0}:${canvasOwnedSectionNode?.height ?? 0}:${canvasOwnedShellHeaderHeight}:${canvasOwnedShellKwargsControlsHeight}:${canvasOwnedShellPinnedParamsHeight}`,
  );
  const restingTextLines = useCanvasOwnedRestingTextLines(
    CANVAS_OWNED_SECTION_SHELL_ID,
    `${canvasOwnedSectionNode?.width ?? 0}:${canvasOwnedSectionNode?.height ?? 0}:${canvasOwnedShellHeaderHeight}:${canvasOwnedShellKwargsControlsHeight}:${canvasOwnedShellPinnedParamsHeight}:${canvasOwnedShellSearchHeight}`,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(
    () =>
      buildSectionShellBackdropScene(nodes.values(), {
        getFrameVisual: (node) => {
          if (!isCanvasOwnedSectionShell(node.id)) {
            return null;
          }

          const chrome = resolveCanvasOwnedSectionShellChrome({
            darkMode,
            styleColor: canvasOwnedShellStyleColor,
          });
          const callableToolbarOffsetY =
            canvasOwnedShellHeaderHeight + canvasOwnedShellSearchHeight;
          const detailBands: Array<{
            cornerRadius: number;
            divider: string | null;
            fill: string | null;
            height: number;
            offsetY: number;
          }> = [];

          if (canvasOwnedShellKwargsControlsHeight > 0) {
            detailBands.push({
              cornerRadius: CALLABLE_TOOLBAR_CORNER_RADIUS_PX,
              divider: chrome.callableToolbarDivider,
              fill: chrome.callableToolbarFill,
              height: canvasOwnedShellKwargsControlsHeight,
              offsetY: callableToolbarOffsetY,
            });
          }
          if (canvasOwnedShellPinnedParamsHeight > 0) {
            detailBands.push({
              cornerRadius: 0,
              divider: chrome.pinnedParamsDivider,
              fill: chrome.pinnedParamsFill,
              height: canvasOwnedShellPinnedParamsHeight,
              offsetY:
                callableToolbarOffsetY + canvasOwnedShellKwargsControlsHeight,
            });
          }

          return {
            ...chrome,
            detailBands,
            detailBoxes: switchTrackBoxes.map((switchTrackBox) => ({
              cornerRadius: switchTrackBox.height / 2,
              fill: switchTrackBox.checked
                ? chrome.switchTrackCheckedFill
                : chrome.switchTrackFill,
              height: switchTrackBox.height,
              width: switchTrackBox.width,
              x: switchTrackBox.offsetX,
              y: switchTrackBox.offsetY,
            })),
            detailTexts: restingTextLines.map((restingTextLine) => ({
              fill: restingTextLine.fill,
              font: restingTextLine.font,
              maxWidth: restingTextLine.maxWidth,
              text: restingTextLine.text,
              x: restingTextLine.offsetX,
              y: restingTextLine.offsetY,
            })),
            headerHeight: canvasOwnedShellHeaderHeight,
          };
        },
      }),
    [
      canvasOwnedShellHeaderHeight,
      canvasOwnedShellKwargsControlsHeight,
      canvasOwnedShellPinnedParamsHeight,
      canvasOwnedShellSearchHeight,
      canvasOwnedShellStyleColor,
      darkMode,
      nodes,
      restingTextLines,
      switchTrackBoxes,
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
