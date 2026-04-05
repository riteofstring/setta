import { resolveSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import type { CSSProperties } from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanarySectionShellAppearance,
  type SettingsGraphSubstrateCanarySectionShellAppearance,
} from "./settingsGraphSubstrateCanarySectionShellAppearance";
import {
  worldPointToScreenPoint,
  type GraphViewport,
} from "./viewportTransform";

const LARGE_CORNER_RADIUS_PX = 8;
const SMALL_CORNER_RADIUS_PX = 2;
const MIN_STROKE_WIDTH = 0.0001;

const BLUE_600 = "#2563eb";
const BLUE_700 = "#1d4ed8";
const GREEN_600 = "#16a34a";
const PURPLE_600 = "#9333ea";
const PURPLE_700 = "#7e22ce";
const RED_400 = "#f87171";
const RED_600 = "#dc2626";
const TURQUOISE_400 = "#22d3ee";
const WHITE = "#ffffff";
const SETTA_300 = "hsl(220, 25%, 67%)";
const SETTA_400 = "hsl(220, 26%, 57%)";
const SETTA_500 = "hsl(220, 25%, 45%)";
const SETTA_600 = "hsl(219, 25%, 34%)";
const SETTA_700 = "hsl(219, 26%, 23%)";
const SETTA_800 = "hsl(220, 26%, 14%)";

const TOP_DRAG_HANDLE_HEIGHT_PX = 4;
const TOP_DRAG_HANDLE_WIDTH_PX = 32;

type SettingsGraphSubstrateCanaryShellPixiColor = {
  alpha: number;
  color: string;
};

export type SettingsGraphSubstrateCanarySectionShellPixiFill =
  SettingsGraphSubstrateCanaryShellPixiColor;

export type SettingsGraphSubstrateCanarySectionShellPixiStroke = {
  alignment: number;
  alpha: number;
  color: string;
  width: number;
};

export type SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle = {
  cornerRadius: number;
  fill: SettingsGraphSubstrateCanarySectionShellPixiFill;
  screenHeight: number;
  screenWidth: number;
  screenX: number;
  screenY: number;
};

export type SettingsGraphSubstrateCanarySectionShellPixiDrawable = {
  border: SettingsGraphSubstrateCanarySectionShellPixiStroke | null;
  cornerRadius: number;
  fill: SettingsGraphSubstrateCanarySectionShellPixiFill | null;
  outline: SettingsGraphSubstrateCanarySectionShellPixiStroke | null;
  screenHeight: number;
  screenWidth: number;
  screenX: number;
  screenY: number;
  sectionId: string;
  topDragHandle: SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null;
};

export function resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
  activeSectionIds,
  darkMode,
  draggingSectionId,
  hoveredSectionId,
  previewStyleColors,
  sceneSections,
  viewport,
}: {
  activeSectionIds: ReadonlyArray<string>;
  darkMode: boolean;
  draggingSectionId: string | null;
  hoveredSectionId: string | null;
  previewStyleColors: Record<string, string | null | undefined>;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
}): Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable> {
  if (!viewport || viewport.zoom <= 0) {
    return [];
  }

  const activeSectionIdSet = new Set(activeSectionIds);
  const drawables: Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable> =
    [];

  for (const section of sceneSections) {
    const drawable =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawable({
        darkMode,
        isActiveSection:
          activeSectionIdSet.has(section.sectionId) ||
          section.isActiveSection === true,
        isTopDragHandleVisible:
          section.sectionId === hoveredSectionId ||
          section.sectionId === draggingSectionId,
        previewStyleColor: previewStyleColors[section.sectionId],
        section,
        viewport,
      });
    if (drawable) {
      drawables.push(drawable);
    }
  }

  return drawables;
}

function resolveSettingsGraphSubstrateCanarySectionShellPixiDrawable({
  darkMode,
  isActiveSection,
  isTopDragHandleVisible,
  previewStyleColor,
  section,
  viewport,
}: {
  darkMode: boolean;
  isActiveSection: boolean;
  isTopDragHandleVisible: boolean;
  previewStyleColor: string | null | undefined;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport;
}): SettingsGraphSubstrateCanarySectionShellPixiDrawable | null {
  const sectionSize = getPositiveSceneSectionSize(section);
  if (!sectionSize) {
    return null;
  }

  const sectionTypeName = section.sectionTypeName ?? SectionTypeEnum.Code;
  const sectionChromeAppearance = resolveSectionChromeAppearance({
    darkMode,
    previewStyleColor,
    sectionTypeName,
    styleColor: section.styleColor ?? null,
    textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
  });
  const shellAppearance =
    resolveSettingsGraphSubstrateCanarySectionShellAppearance({
      hasSectionStyleTheme: sectionChromeAppearance.hasSectionStyleTheme,
      isActiveSection,
      isInOtherProjectConfigs: section.isInOtherProjectConfigs ?? false,
      positionAndSizeLocked: section.positionAndSizeLocked,
      sectionStyleVars: sectionChromeAppearance.sectionStyleVars,
      sectionTypeName,
      useMetaControlStyle: sectionChromeAppearance.useMetaControlStyle,
    });
  const screenPosition = worldPointToScreenPoint(
    section.renderedPosition,
    viewport,
  );
  const screenSize = {
    height: sectionSize.height * viewport.zoom,
    width: sectionSize.width * viewport.zoom,
  };

  if (screenSize.width <= 0 || screenSize.height <= 0) {
    return null;
  }

  const border = resolveSectionShellPixiBorderStroke(
    shellAppearance,
    darkMode,
    viewport.zoom,
  );
  const fill = resolveSectionShellPixiFill(
    sectionChromeAppearance.backgroundColor,
  );
  const outline = resolveSectionShellPixiOutlineStroke(
    shellAppearance,
    darkMode,
    viewport.zoom,
  );
  const topDragHandle = resolveSectionShellPixiTopDragHandle({
    appearance: shellAppearance,
    darkMode,
    isVisible: isTopDragHandleVisible,
    screenWidth: screenSize.width,
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    zoom: viewport.zoom,
  });

  if (!border && !fill && !outline && !topDragHandle) {
    return null;
  }

  return {
    border,
    cornerRadius:
      (shellAppearance.frameStructure.cornerStyle === "small"
        ? SMALL_CORNER_RADIUS_PX
        : LARGE_CORNER_RADIUS_PX) * viewport.zoom,
    fill,
    outline,
    screenHeight: screenSize.height,
    screenWidth: screenSize.width,
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    sectionId: section.sectionId,
    topDragHandle,
  };
}

function resolveSectionShellPixiFill(backgroundColor: string | null) {
  if (backgroundColor === null) {
    return null;
  }

  return {
    alpha: 1,
    color: backgroundColor,
  };
}

function resolveSectionShellPixiBorderStroke(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
  darkMode: boolean,
  zoom: number,
): SettingsGraphSubstrateCanarySectionShellPixiStroke | null {
  if (
    !appearance.frameStructure.shellBorderVisible ||
    appearance.frameStructure.shellBorderTone === "transparent"
  ) {
    return null;
  }

  const color = appearance.hasSectionStyleTheme
    ? getSectionStyleColor(
        appearance.sectionStyleVars,
        "--setta-section-style-border",
      )
    : resolveSectionShellPixiShellBorderColor(
        appearance.frameStructure.shellBorderTone,
        darkMode,
      );

  if (!color) {
    return null;
  }

  return {
    alignment: 1,
    alpha: color.alpha,
    color: color.color,
    width: Math.max(zoom, MIN_STROKE_WIDTH),
  };
}

function resolveSectionShellPixiOutlineStroke(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
  darkMode: boolean,
  zoom: number,
): SettingsGraphSubstrateCanarySectionShellPixiStroke | null {
  const outlineWidth = appearance.frameStructure.shellOutlineWidth;
  if (outlineWidth === 0) {
    return null;
  }

  const color = resolveSectionShellPixiOutlineColor(appearance, darkMode);
  if (!color) {
    return null;
  }

  return {
    alignment: 0,
    alpha: color.alpha,
    color: color.color,
    width: Math.max(outlineWidth * zoom, MIN_STROKE_WIDTH),
  };
}

function resolveSectionShellPixiTopDragHandle({
  appearance,
  darkMode,
  isVisible,
  screenWidth,
  screenX,
  screenY,
  zoom,
}: {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
  darkMode: boolean;
  isVisible: boolean;
  screenWidth: number;
  screenX: number;
  screenY: number;
  zoom: number;
}): SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null {
  if (!isVisible || !appearance.surfaceDecorations.showTopDragHandle) {
    return null;
  }

  const fill = resolveSectionShellPixiTopDragHandleFill(appearance, darkMode);
  if (!fill) {
    return null;
  }

  const topDragHandleWidth = TOP_DRAG_HANDLE_WIDTH_PX * zoom;
  const topDragHandleHeight = TOP_DRAG_HANDLE_HEIGHT_PX * zoom;

  return {
    cornerRadius: topDragHandleHeight / 2,
    fill,
    screenHeight: topDragHandleHeight,
    screenWidth: topDragHandleWidth,
    screenX: screenX + (screenWidth - topDragHandleWidth) / 2,
    screenY: screenY - topDragHandleHeight / 2,
  };
}

function resolveSectionShellPixiTopDragHandleFill(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
  darkMode: boolean,
): SettingsGraphSubstrateCanarySectionShellPixiFill | null {
  if (appearance.hasSectionStyleTheme) {
    const color = getSectionStyleColor(
      appearance.sectionStyleVars,
      "--setta-section-style-border",
    );
    if (!color) {
      return null;
    }
    return {
      alpha: 0.7,
      color: color.color,
    };
  }

  return appearance.surfaceDecorations.resizeHandleTone === "minimal"
    ? {
        alpha: 0.7,
        color: darkMode ? SETTA_600 : SETTA_300,
      }
    : {
        alpha: 0.8,
        color: darkMode ? SETTA_500 : SETTA_400,
      };
}

function resolveSectionShellPixiShellBorderColor(
  shellBorderTone: SettingsGraphSubstrateCanarySectionShellAppearance["frameStructure"]["shellBorderTone"],
  darkMode: boolean,
): SettingsGraphSubstrateCanaryShellPixiColor | null {
  switch (shellBorderTone) {
    case "transparent":
      return null;
    case "locked":
      return darkMode
        ? { alpha: 1, color: SETTA_800 }
        : { alpha: 0.9, color: SETTA_400 };
    case "default":
      return darkMode
        ? { alpha: 1, color: SETTA_700 }
        : { alpha: 1, color: WHITE };
  }
}

function resolveSectionShellPixiOutlineColor(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
  darkMode: boolean,
): SettingsGraphSubstrateCanaryShellPixiColor | null {
  const outlineTone = appearance.shellDecorations.outlineTone;
  if (outlineTone === "missing-source") {
    return {
      alpha: 1,
      color: darkMode ? RED_400 : RED_600,
    };
  }

  if (appearance.hasSectionStyleTheme) {
    if (!isVisibleActiveOutlineTone(outlineTone)) {
      return null;
    }
    const themedOutlineColor = getSectionStyleColor(
      appearance.sectionStyleVars,
      "--setta-section-style-outline",
    );
    if (!themedOutlineColor) {
      return null;
    }
    return themedOutlineColor;
  }

  switch (outlineTone) {
    case "global-active":
      return {
        alpha: 1,
        color: darkMode ? TURQUOISE_400 : GREEN_600,
      };
    case "other-project-active":
      return {
        alpha: 1,
        color: darkMode ? PURPLE_700 : PURPLE_600,
      };
    case "active":
      return {
        alpha: 1,
        color: darkMode ? BLUE_700 : BLUE_600,
      };
    case "inactive":
    case "other-project-inactive":
      return null;
  }
}

function isVisibleActiveOutlineTone(
  outlineTone: SettingsGraphSubstrateCanarySectionShellAppearance["shellDecorations"]["outlineTone"],
) {
  return (
    outlineTone === "global-active" ||
    outlineTone === "other-project-active" ||
    outlineTone === "active"
  );
}

function getPositiveSceneSectionSize(
  section: Pick<
    SettingsGraphSubstrateCanarySceneSection,
    "height" | "resolvedSize" | "width"
  >,
) {
  const width = section.resolvedSize?.width ?? section.width ?? 0;
  const height = section.resolvedSize?.height ?? section.height ?? 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function getSectionStyleColor(
  sectionStyleVars: CSSProperties | undefined,
  key: string,
): SettingsGraphSubstrateCanaryShellPixiColor | null {
  const value = sectionStyleVars?.[key as keyof CSSProperties];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return {
    alpha: 1,
    color: value,
  };
}
