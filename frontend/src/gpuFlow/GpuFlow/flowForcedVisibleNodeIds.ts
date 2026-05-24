import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function getGpuFlowCommittedSurfaceForceVisibleNodeIds(
  baseForceVisibleNodeIds: GpuFlowNodeLayerState["forceVisibleNodeIds"],
  committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void,
): GpuFlowNodeLayerState["forceVisibleNodeIds"] {
  const sectionSurfaceIds = getGpuFlowCommittedSurfaceSectionSurfaceIds(
    committedSurfaceFrame,
  );
  if (sectionSurfaceIds.length === 0) {
    return baseForceVisibleNodeIds;
  }
  if (baseForceVisibleNodeIds === undefined) {
    return sectionSurfaceIds;
  }
  return Object.freeze(
    [...new Set([...baseForceVisibleNodeIds, ...sectionSurfaceIds])],
  );
}

function getGpuFlowCommittedSurfaceSectionSurfaceIds(
  committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void,
): readonly string[] {
  if (!committedSurfaceFrame) {
    return [];
  }
  const sectionSurfaceIds = new Set<string>();
  for (const actor of committedSurfaceFrame.actorGenerations) {
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
