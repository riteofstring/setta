import type { GpuNodeResizeDirection } from "gpuFlow/resizeHandles";
import type { getResizableEnable } from "state/actions/sections/sectionResizePolicy";
import { useResizeEvent, useSettings } from "state/definitions";
import type { SectionSizingPolicy } from "utils/generatedTypes";

export type ProjectGpuSceneResizePolicyContext = {
  readonly resizeEventBySectionId: Readonly<Record<string, string | undefined>>;
  readonly sizingPolicy: SectionSizingPolicy;
};

export function getProjectGpuSceneResizePolicyContext(): ProjectGpuSceneResizePolicyContext {
  return {
    resizeEventBySectionId: useResizeEvent.getState().resizeEvent,
    sizingPolicy: useSettings.getState().sectionSizingPolicy,
  };
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
