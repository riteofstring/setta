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
  return getProjectSceneMeasuredHeightFromRecord(
    resizePolicyContext.measuredHeightsByKey,
    key,
  );
}

export function getProjectSceneMeasuredHeightFromRecord(
  measuredHeightsByKey: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number {
  const height = measuredHeightsByKey?.[key];
  return typeof height === "number" && Number.isFinite(height) && height > 0
    ? height
    : 0;
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
