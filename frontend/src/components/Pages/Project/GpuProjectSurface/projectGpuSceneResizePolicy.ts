import type { GpuNodeResizeDirection } from "gpuFlow/resizeHandles";
import type { getResizableEnable } from "state/actions/sections/sectionResizePolicy";
import type { SectionSizingPolicy } from "utils/generatedTypes";

export type ProjectGpuSceneResizePolicyContext = {
  readonly measuredHeightsByKey: Readonly<Record<string, unknown>>;
  readonly resizeEventBySectionId: Readonly<Record<string, string | undefined>>;
  readonly sizingPolicy: SectionSizingPolicy;
};

export function getProjectSceneMeasuredHeight(
  resizePolicyContext: ProjectGpuSceneResizePolicyContext,
  key: string,
): number {
  const height = resizePolicyContext.measuredHeightsByKey[key];
  return typeof height === "number" ? height : 0;
}

export function getProjectSectionSceneResizeDirections(
  enable: Exclude<ReturnType<typeof getResizableEnable>, false>,
): readonly GpuNodeResizeDirection[] {
  const directions: GpuNodeResizeDirection[] = [];
  if (enable.right) {
    directions.push("right");
  }
  if (enable.bottom) {
    directions.push("bottom");
  }
  if (enable.bottomRight) {
    directions.push("bottomRight");
  }
  return directions;
}
