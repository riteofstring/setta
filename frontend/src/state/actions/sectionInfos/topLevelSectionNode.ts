import type { Node } from "gpuFlow/flowTypes";
import type {
  BaseSectionImplUnion,
  TopLevelSectionLayout,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

const DEFAULT_TOP_LEVEL_SECTION_WIDTH = 250;
const DEFAULT_TOP_LEVEL_SECTION_HEIGHT = 150;
// SectionSize records the inner resize surface; GpuFlow lays out the outer
// section shell, whose border adds one CSS pixel on each side.
export const TOP_LEVEL_SECTION_SHELL_CHROME_PX = 2;

function getPositiveFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function resolveTopLevelSectionNodeDimension({
  fallback,
  layoutDimension,
  sectionSizeDimension,
}: {
  fallback: number;
  layoutDimension: unknown;
  sectionSizeDimension: unknown;
}): number | null {
  const sectionSize = getPositiveFiniteNumber(sectionSizeDimension);
  if (sectionSize !== null) {
    return toTopLevelSectionOuterDimension(sectionSize);
  }
  if (sectionSizeDimension === "auto") {
    return null;
  }
  return getPositiveFiniteNumber(layoutDimension) ?? fallback;
}

export function toTopLevelSectionOuterDimension(
  sectionSizeDimension: number,
): number {
  return sectionSizeDimension + TOP_LEVEL_SECTION_SHELL_CHROME_PX;
}

export function toTopLevelSectionInnerDimension(
  nodeDimension: number,
): number {
  return Math.max(nodeDimension - TOP_LEVEL_SECTION_SHELL_CHROME_PX, 0);
}

export function getSectionNodeStyle(
  sectionImpl: BaseSectionImplUnion | null,
  darkMode: boolean,
) {
  const styleColor = sectionImpl?.styleColor;
  if (
    styleColor === null ||
    styleColor === undefined ||
    styleColor.trim() === ""
  ) {
    return undefined;
  }
  return { background: deriveSectionStyleTheme(styleColor, darkMode).bg };
}

export function buildTopLevelSectionNode({
  darkMode,
  layout,
  sectionId,
  sectionImpl,
}: {
  darkMode: boolean;
  layout: TopLevelSectionLayout;
  sectionId: string;
  sectionImpl: BaseSectionImplUnion | null;
}): Node {
  return {
    id: sectionId,
    position: { x: layout.x, y: layout.y },
    width: resolveTopLevelSectionNodeDimension({
      fallback: DEFAULT_TOP_LEVEL_SECTION_WIDTH,
      layoutDimension: layout.w,
      sectionSizeDimension: sectionImpl?.size.width,
    }),
    height: resolveTopLevelSectionNodeDimension({
      fallback: DEFAULT_TOP_LEVEL_SECTION_HEIGHT,
      layoutDimension: layout.h,
      sectionSizeDimension: sectionImpl?.size.height,
    }),
    zIndex: layout.zIndex ?? 0,
    tempZIndex: layout.zIndex ?? 0,
    type: sectionImpl?.type,
    style: getSectionNodeStyle(sectionImpl, darkMode),
  };
}

export function getPositiveTopLevelLayoutDimension(
  value: unknown,
): number | null {
  return getPositiveFiniteNumber(value);
}
