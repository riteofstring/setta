import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function getGpuFlowPreparedContentFrameForceVisibleNodeIds(
  baseForceVisibleNodeIds: GpuFlowNodeLayerState["forceVisibleNodeIds"],
  preparedContentFrame: GpuFlowPreparedContentFrame | void,
): GpuFlowNodeLayerState["forceVisibleNodeIds"] {
  const sectionSurfaceIds =
    getGpuFlowPreparedContentSectionSurfaceIds(preparedContentFrame);
  if (sectionSurfaceIds.length === 0) {
    return baseForceVisibleNodeIds;
  }
  if (baseForceVisibleNodeIds === undefined) {
    return sectionSurfaceIds;
  }
  return Object.freeze([
    ...new Set([...baseForceVisibleNodeIds, ...sectionSurfaceIds]),
  ]);
}

function getGpuFlowPreparedContentSectionSurfaceIds(
  preparedContentFrame: GpuFlowPreparedContentFrame | void,
): readonly string[] {
  if (!preparedContentFrame) {
    return [];
  }
  const sectionSurfaceIds = new Set<string>();
  for (const actor of preparedContentFrame.actorGenerations) {
    if (
      actor.visibleNonempty &&
      (actor.actorFamily === "section-body-clip" ||
        actor.actorFamily === "section-header" ||
        actor.actorFamily === "section-shell")
    ) {
      sectionSurfaceIds.add(actor.ownerSurfaceId);
    }
  }
  return Object.freeze([...sectionSurfaceIds]);
}
