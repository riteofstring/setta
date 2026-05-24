import {
  compareNodeTexturePriority,
  type DirtyNodeState,
} from "../dirtyTracking";
import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureHandle,
} from "./textureRecords";

export function orderDirtySurfacesForUpload(
  dirtySurfaces: readonly DirtyNodeState[],
  records: ReadonlyMap<string, HtmlSurfaceTextureHandle>,
): readonly DirtyNodeState[] {
  return [...dirtySurfaces].sort(
    (left, right) =>
      compareNodeTexturePriority(left.priority, right.priority) ||
      compareFirstUploadState(left, right, records) ||
      compareDirtyContent(left, right) ||
      left.sequence - right.sequence,
  );
}

export function isProtectedTexturePriority(
  priority: DirtyNodeState["priority"],
): boolean {
  return priority === "critical" || priority === "interactive";
}

export function shouldCompleteCriticalFirstUpload(
  dirtySurface: Pick<DirtyNodeState, "priority">,
  record: Pick<CommittedHtmlSurfaceTextureSnapshot, "lastUploadFrame">,
): boolean {
  return dirtySurface.priority === "critical" && record.lastUploadFrame < 0;
}

export function shouldBypassUploadLoopBudgetForCriticalFirstUpload(
  dirtySurface: DirtyNodeState,
  records: ReadonlyMap<string, HtmlSurfaceTextureHandle>,
): boolean {
  const record = records.get(dirtySurface.nodeId);
  return record
    ? shouldCompleteCriticalFirstUpload(dirtySurface, record.committed)
    : false;
}

function compareFirstUploadState(
  left: DirtyNodeState,
  right: DirtyNodeState,
  records: ReadonlyMap<string, HtmlSurfaceTextureHandle>,
): number {
  const leftNeedsFirstUpload = needsFirstUpload(left, records);
  const rightNeedsFirstUpload = needsFirstUpload(right, records);
  if (leftNeedsFirstUpload === rightNeedsFirstUpload) {
    return 0;
  }
  return leftNeedsFirstUpload ? -1 : 1;
}

function needsFirstUpload(
  dirtySurface: DirtyNodeState,
  records: ReadonlyMap<string, HtmlSurfaceTextureHandle>,
): boolean {
  const record = records.get(dirtySurface.nodeId);
  return record ? record.committed.lastUploadFrame < 0 : false;
}

function compareDirtyContent(
  left: Pick<DirtyNodeState, "dirtyContent">,
  right: Pick<DirtyNodeState, "dirtyContent">,
): number {
  if (left.dirtyContent === right.dirtyContent) {
    return 0;
  }
  return left.dirtyContent ? -1 : 1;
}
