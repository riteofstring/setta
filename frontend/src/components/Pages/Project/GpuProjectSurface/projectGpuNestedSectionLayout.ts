import type {
  GpuSectionSceneChildLayout,
  GpuSectionSceneLayoutMode,
} from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import type { BaseSectionImplUnion } from "utils/generatedTypes";
import { resolveProjectSectionSceneDimension } from "./projectSectionSceneDimension";

export const DEFAULT_PROJECT_GPU_NESTED_SECTION_WIDTH = 250;
export const DEFAULT_PROJECT_GPU_NESTED_SECTION_HEIGHT = 150;

const NESTED_VERTICAL_SECTION_GAP_PX = 8;
const NESTED_HORIZONTAL_SECTION_GAP_PX = 8;
const NESTED_KANBAN_SECTION_GAP_PX = 12;
const NESTED_KANBAN_SECTION_WIDTH_PX = 288;

export function createProjectNestedSectionInitialLocalRect({
  parentLayoutMode,
  sectionImpl,
}: {
  readonly parentLayoutMode: GpuSectionSceneLayoutMode;
  readonly sectionImpl: BaseSectionImplUnion;
}): GpuRect {
  return {
    ...getProjectNestedSectionSceneSize(sectionImpl, parentLayoutMode),
    x: 0,
    y: 0,
  };
}

export function getProjectSectionSceneChildLayout(
  layoutMode: GpuSectionSceneLayoutMode,
): GpuSectionSceneChildLayout {
  const gap = getProjectNestedSectionGap(layoutMode);
  if (layoutMode === "horizontal" || layoutMode === "kanban") {
    return { gap: { x: gap, y: 0 } };
  }
  if (layoutMode === "vertical") {
    return { gap: { x: 0, y: gap } };
  }
  return { gap: { x: 0, y: 0 } };
}

function getProjectNestedSectionSceneSize(
  sectionImpl: BaseSectionImplUnion,
  layoutMode: GpuSectionSceneLayoutMode,
): { readonly height: number; readonly width: number } {
  return {
    height: resolveProjectSectionSceneDimension(
      sectionImpl.size.height,
      DEFAULT_PROJECT_GPU_NESTED_SECTION_HEIGHT,
    ),
    width: resolveProjectSectionSceneDimension(
      sectionImpl.size.width,
      layoutMode === "kanban"
        ? NESTED_KANBAN_SECTION_WIDTH_PX
        : DEFAULT_PROJECT_GPU_NESTED_SECTION_WIDTH,
    ),
  };
}

function getProjectNestedSectionGap(
  layoutMode: GpuSectionSceneLayoutMode,
): number {
  if (layoutMode === "kanban") {
    return NESTED_KANBAN_SECTION_GAP_PX;
  }
  if (layoutMode === "horizontal") {
    return NESTED_HORIZONTAL_SECTION_GAP_PX;
  }
  return NESTED_VERTICAL_SECTION_GAP_PX;
}
