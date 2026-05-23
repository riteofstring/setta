import type { ProjectGpuActiveParamDomIsland } from "./projectGpuLayoutAdapter";

export function areProjectGpuActiveParamDomIslandsEquivalent(
  left: ProjectGpuActiveParamDomIsland | null,
  right: ProjectGpuActiveParamDomIsland | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.hitRecordId === right.hitRecordId &&
    left.paramInfoId === right.paramInfoId &&
    left.sectionId === right.sectionId &&
    left.surfaceId === right.surfaceId &&
    areProjectGpuActiveParamDomIslandActivationsEquivalent(
      left.activation,
      right.activation,
    )
  );
}

function areProjectGpuActiveParamDomIslandActivationsEquivalent(
  left: ProjectGpuActiveParamDomIsland["activation"],
  right: ProjectGpuActiveParamDomIsland["activation"],
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.kind === right.kind &&
    left.clientPoint.x === right.clientPoint.x &&
    left.clientPoint.y === right.clientPoint.y
  );
}
