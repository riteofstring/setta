import {
  resolveSectionChromeAppearance,
  type SectionChromeStaticColor,
} from "components/Section/Container/sectionChromeAppearance";
import type { CSSProperties } from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import type {
  SettingsGraphSubstrateCanarySectionSeedNode,
  SettingsGraphSubstrateCanarySectionSeedNodes,
} from "./settingsGraphSubstrateCanarySectionSeedNodes";
import {
  resolveSettingsGraphSubstrateCanarySectionShellAppearance,
  type SettingsGraphSubstrateCanarySectionShellAppearance,
} from "./settingsGraphSubstrateCanarySectionShellAppearance";

const LARGE_CORNER_RADIUS_PX = 8;
const SMALL_CORNER_RADIUS_PX = 2;

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
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SettingsGraphSubstrateCanarySectionShellPixiDrawable = {
  border: SettingsGraphSubstrateCanarySectionShellPixiStroke | null;
  cornerRadius: number;
  fill: SettingsGraphSubstrateCanarySectionShellPixiFill | null;
  outline: SettingsGraphSubstrateCanarySectionShellPixiStroke | null;
  surfaceFrame: SettingsGraphSubstrateCanarySectionShellPixiStroke | null;
  height: number;
  width: number;
  x: number;
  y: number;
  sectionId: string;
  topDragHandle: SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null;
};

export function areSettingsGraphSubstrateCanarySectionShellPixiDrawablesEqual(
  left: ReadonlyArray<SettingsGraphSubstrateCanarySectionShellPixiDrawable>,
  right: ReadonlyArray<SettingsGraphSubstrateCanarySectionShellPixiDrawable>,
) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftDrawable = left[index];
    const rightDrawable = right[index];
    if (!leftDrawable || !rightDrawable) {
      return false;
    }
    if (
      !areSettingsGraphSubstrateCanarySectionShellPixiDrawableEqual(
        leftDrawable,
        rightDrawable,
      )
    ) {
      return false;
    }
  }

  return true;
}

export function resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
  activeSectionIds,
  darkMode,
  draggingSectionId,
  hoveredSectionId,
  previewStyleColors,
  sceneSections,
  sectionSeedNodes,
}: {
  activeSectionIds: ReadonlyArray<string>;
  darkMode: boolean;
  draggingSectionId: string | null;
  hoveredSectionId: string | null;
  previewStyleColors: Record<string, string | null | undefined>;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionSeedNodes: SettingsGraphSubstrateCanarySectionSeedNodes;
}): Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable> {
  const activeSectionIdSet = new Set(activeSectionIds);
  const drawables: Array<SettingsGraphSubstrateCanarySectionShellPixiDrawable> =
    [];

  for (const section of sceneSections) {
    const isHoveredSection =
      section.sectionId === hoveredSectionId ||
      section.sectionId === draggingSectionId;
    const sectionSeedNode = sectionSeedNodes.get(section.sectionId);
    const drawable =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawable({
        darkMode,
        isActiveSection:
          activeSectionIdSet.has(section.sectionId) ||
          section.isActiveSection === true,
        isSurfaceFrameHovered: isHoveredSection,
        isTopDragHandleVisible: isHoveredSection,
        previewStyleColor: previewStyleColors[section.sectionId],
        section,
        sectionSeedNode,
      });
    if (drawable) {
      drawables.push(drawable);
    }
  }

  return drawables;
}

function areSettingsGraphSubstrateCanarySectionShellPixiDrawableEqual(
  left: SettingsGraphSubstrateCanarySectionShellPixiDrawable,
  right: SettingsGraphSubstrateCanarySectionShellPixiDrawable,
) {
  return (
    left.sectionId === right.sectionId &&
    left.cornerRadius === right.cornerRadius &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    areSettingsGraphSubstrateCanarySectionShellPixiFillEqual(
      left.fill,
      right.fill,
    ) &&
    areSettingsGraphSubstrateCanarySectionShellPixiStrokeEqual(
      left.border,
      right.border,
    ) &&
    areSettingsGraphSubstrateCanarySectionShellPixiStrokeEqual(
      left.outline,
      right.outline,
    ) &&
    areSettingsGraphSubstrateCanarySectionShellPixiStrokeEqual(
      left.surfaceFrame,
      right.surfaceFrame,
    ) &&
    areSettingsGraphSubstrateCanarySectionShellPixiTopDragHandlesEqual(
      left.topDragHandle,
      right.topDragHandle,
    )
  );
}

function areSettingsGraphSubstrateCanarySectionShellPixiFillEqual(
  left: SettingsGraphSubstrateCanarySectionShellPixiFill | null,
  right: SettingsGraphSubstrateCanarySectionShellPixiFill | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return left.alpha === right.alpha && left.color === right.color;
}

function areSettingsGraphSubstrateCanarySectionShellPixiStrokeEqual(
  left: SettingsGraphSubstrateCanarySectionShellPixiStroke | null,
  right: SettingsGraphSubstrateCanarySectionShellPixiStroke | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.alignment === right.alignment &&
    left.alpha === right.alpha &&
    left.color === right.color &&
    left.width === right.width
  );
}

function areSettingsGraphSubstrateCanarySectionShellPixiTopDragHandlesEqual(
  left: SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null,
  right: SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.cornerRadius === right.cornerRadius &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    areSettingsGraphSubstrateCanarySectionShellPixiFillEqual(
      left.fill,
      right.fill,
    )
  );
}

function resolveSettingsGraphSubstrateCanarySectionShellPixiDrawable({
  darkMode,
  isActiveSection,
  isSurfaceFrameHovered,
  isTopDragHandleVisible,
  previewStyleColor,
  section,
  sectionSeedNode,
}: {
  darkMode: boolean;
  isActiveSection: boolean;
  isSurfaceFrameHovered: boolean;
  isTopDragHandleVisible: boolean;
  previewStyleColor: string | null | undefined;
  section: SettingsGraphSubstrateCanarySceneSection;
  sectionSeedNode: SettingsGraphSubstrateCanarySectionSeedNode | undefined;
}): SettingsGraphSubstrateCanarySectionShellPixiDrawable | null {
  const sectionSize = getPositiveSceneSectionSize(section, sectionSeedNode);
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
  if (sectionSize.width <= 0 || sectionSize.height <= 0) {
    return null;
  }

  const border = resolveSectionShellPixiBorderStroke(shellAppearance, darkMode);
  const fill = resolveSectionShellPixiFill(
    sectionChromeAppearance.backgroundColor,
  );
  const outline = resolveSectionShellPixiOutlineStroke(
    shellAppearance,
    darkMode,
  );
  const surfaceFrame = resolveSectionShellPixiSurfaceFrameStroke({
    appearance: shellAppearance,
    hoverStrokeColor: sectionChromeAppearance.surfaceFrameHoverColor,
    isHovered: isSurfaceFrameHovered,
    strokeColor: sectionChromeAppearance.surfaceFrameColor,
  });
  const topDragHandle = resolveSectionShellPixiTopDragHandle({
    appearance: shellAppearance,
    darkMode,
    isVisible: isTopDragHandleVisible,
    sectionWidth: sectionSize.width,
    sectionX: section.renderedPosition.x,
    sectionY: section.renderedPosition.y,
  });

  if (!border && !fill && !outline && !surfaceFrame && !topDragHandle) {
    return null;
  }

  return {
    border,
    cornerRadius:
      shellAppearance.frameStructure.cornerStyle === "small"
        ? SMALL_CORNER_RADIUS_PX
        : LARGE_CORNER_RADIUS_PX,
    fill,
    outline,
    surfaceFrame,
    height: sectionSize.height,
    width: sectionSize.width,
    x: section.renderedPosition.x,
    y: section.renderedPosition.y,
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
    width: 1,
  };
}

function resolveSectionShellPixiOutlineStroke(
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance,
  darkMode: boolean,
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
    width: outlineWidth,
  };
}

function resolveSectionShellPixiSurfaceFrameStroke({
  appearance,
  hoverStrokeColor,
  isHovered,
  strokeColor,
}: {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
  hoverStrokeColor: SectionChromeStaticColor | null;
  isHovered: boolean;
  strokeColor: SectionChromeStaticColor | null;
}): SettingsGraphSubstrateCanarySectionShellPixiStroke | null {
  if (!appearance.frameStructure.surfaceFrameVisible) {
    return null;
  }

  const color =
    isHovered && hoverStrokeColor !== null ? hoverStrokeColor : strokeColor;
  if (!color) {
    return null;
  }

  return {
    alignment: 1,
    alpha: color.alpha,
    color: color.color,
    width: 1,
  };
}

function resolveSectionShellPixiTopDragHandle({
  appearance,
  darkMode,
  isVisible,
  sectionWidth,
  sectionX,
  sectionY,
}: {
  appearance: SettingsGraphSubstrateCanarySectionShellAppearance;
  darkMode: boolean;
  isVisible: boolean;
  sectionWidth: number;
  sectionX: number;
  sectionY: number;
}): SettingsGraphSubstrateCanarySectionShellPixiTopDragHandle | null {
  if (!isVisible || !appearance.surfaceDecorations.showTopDragHandle) {
    return null;
  }

  const fill = resolveSectionShellPixiTopDragHandleFill(appearance, darkMode);
  if (!fill) {
    return null;
  }

  const topDragHandleWidth = TOP_DRAG_HANDLE_WIDTH_PX;
  const topDragHandleHeight = TOP_DRAG_HANDLE_HEIGHT_PX;

  return {
    cornerRadius: topDragHandleHeight / 2,
    fill,
    height: topDragHandleHeight,
    width: topDragHandleWidth,
    x: sectionX + (sectionWidth - topDragHandleWidth) / 2,
    y: sectionY - topDragHandleHeight / 2,
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
  section: Pick<SettingsGraphSubstrateCanarySceneSection, "height" | "width">,
  sectionSeedNode: SettingsGraphSubstrateCanarySectionSeedNode | undefined,
) {
  const width = section.width ?? sectionSeedNode?.width ?? 0;
  const height = section.height ?? sectionSeedNode?.height ?? 0;

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
