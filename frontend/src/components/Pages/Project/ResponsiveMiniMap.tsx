import type { GpuMiniMapNodeVisual } from "gpuFlow/GpuMiniMap";
import GpuMiniMap from "gpuFlow/GpuMiniMap";
import { getZoom, setCenter } from "gpuFlow/viewportActions";
import type { CSSProperties } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useActiveSectionUI,
  useLocalStorage,
  useProjectState,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { useProjectGpuLayoutStore } from "./GpuProjectSurface/projectGpuLayoutAdapter";

const SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX = "section-style-preview-color-";

type ResponsiveMiniMapPlacement = {
  position: "bottom-left" | "bottom-right";
  transform: string;
};

type MiniMapPreviewStyleColors = Record<string, string | null>;

function getResponsiveMiniMapPlacement({
  minimapSide,
  overviewWidth,
  uiEditorWidth,
}: {
  minimapSide: "left" | "right";
  overviewWidth: number;
  uiEditorWidth: number;
}): ResponsiveMiniMapPlacement {
  if (minimapSide === "right") {
    return {
      position: "bottom-right",
      transform: `translateX(-${Math.max(0, uiEditorWidth)}px)`,
    };
  }
  return {
    position: "bottom-left",
    transform: `translateX(${Math.max(0, overviewWidth)}px)`,
  };
}

export function ResponsiveMiniMap() {
  const layoutStore = useProjectGpuLayoutStore();
  const overviewWidth = useLocalStorage((x) => x.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((x) => x.uiEditorTrueWidth);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const minimapSide = useLocalStorage((x) => x.minimapSide);
  const activeIds = useActiveSectionUI(
    (state) => state.activeIds,
    areStringArraysEqual,
  );
  const previewStyleColors = useTemporaryMiscState(
    getMiniMapPreviewStyleColors,
    areMiniMapPreviewStyleColorsEqual,
  );
  const nodeVisuals = useProjectState(
    (state) => getMiniMapNodeVisuals(state, darkMode, previewStyleColors),
    areMiniMapNodeVisualsEqual,
  );
  const placement = getResponsiveMiniMapPlacement({
    minimapSide,
    overviewWidth,
    uiEditorWidth,
  });

  return (
    <GpuMiniMap
      layoutStore={layoutStore}
      nodeVisuals={nodeVisuals}
      nodeStrokeColor={(n) => {
        const background = getStringBackground(n.style);
        if (background) return background;
        if (n.type === "input") return "#0041d0";
        if (n.type === "output") return "#ff0072";
        if (n.type === "default") return "#1a192b";

        return "#e2e8f0";
      }}
      nodeColor={(n) => {
        const background = getStringBackground(n.style);
        if (background) return background;

        if (darkMode) {
          return "#2D384D";
        }
        return "#e2e8f0";
      }}
      nodeBorderRadius={5}
      position={placement.position}
      style={{ transform: placement.transform }}
      className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm transition-transform"
      maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
      maskStrokeColor={
        darkMode ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)"
      }
      maskStrokeWidth={2}
      pannable
      selectedNodeIds={activeIds}
      onClick={(_event, { x, y }) => {
        setCenter(x, y, { overviewWidth, zoom: getZoom() });
      }}
    />
  );
}

function getStringBackground(style: CSSProperties | undefined): string | null {
  return typeof style?.background === "string" ? style.background : null;
}

function getMiniMapPreviewStyleColors(
  state: Record<string, unknown>,
): MiniMapPreviewStyleColors {
  const previewColors: MiniMapPreviewStyleColors = {};
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX)) {
      continue;
    }
    const sectionId = key.slice(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX.length);
    previewColors[sectionId] = typeof value === "string" ? value : null;
  }
  return previewColors;
}

function areMiniMapPreviewStyleColorsEqual(
  left: MiniMapPreviewStyleColors,
  right: MiniMapPreviewStyleColors,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function getMiniMapNodeVisuals(
  state: ZustandProjectState,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): GpuMiniMapNodeVisual[] {
  const visuals: GpuMiniMapNodeVisual[] = [];
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const visual = resolveMiniMapNodeVisual(
      state,
      sectionId,
      variantId,
      darkMode,
      previewStyleColors,
    );
    if (visual) {
      visuals.push(visual);
    }
  }
  visuals.sort((left, right) => left.id.localeCompare(right.id));
  return visuals;
}

function resolveMiniMapNodeVisual(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): GpuMiniMapNodeVisual | null {
  if ((state.parentSectionMap[sectionId] ?? null) !== null) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (
    !variant ||
    !state.sections[sectionId] ||
    !state.sectionImpls[variant.impl]
  ) {
    return null;
  }
  const effectiveImpl = getCurrEffectiveSectionImpl(state, sectionId);
  const background = resolveMiniMapNodeBackground(
    previewStyleColors[sectionId] === undefined
      ? effectiveImpl.styleColor
      : previewStyleColors[sectionId],
    darkMode,
  );
  return {
    id: sectionId,
    type: effectiveImpl.type,
    style: background === null ? undefined : { background },
  };
}

function resolveMiniMapNodeBackground(
  styleColor: string | null | undefined,
  darkMode: boolean,
) {
  if (styleColor === null || styleColor === undefined) {
    return null;
  }
  const normalizedStyleColor = styleColor.trim();
  if (normalizedStyleColor === "") {
    return null;
  }
  return deriveSectionStyleTheme(normalizedStyleColor, darkMode)?.bg ?? null;
}

function areMiniMapNodeVisualsEqual(
  left: readonly GpuMiniMapNodeVisual[],
  right: readonly GpuMiniMapNodeVisual[],
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (
      leftNode.id !== rightNode.id ||
      leftNode.type !== rightNode.type ||
      !areNodeStylesEqual(leftNode.style, rightNode.style)
    ) {
      return false;
    }
  }
  return true;
}

function areNodeStylesEqual(
  left: CSSProperties | undefined,
  right: CSSProperties | undefined,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (
      left[key as keyof CSSProperties] !== right[key as keyof CSSProperties]
    ) {
      return false;
    }
  }
  return true;
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
