import {
  applyHtmlSurfaceActiveDomIslandProjection,
  hideHtmlSurfaceActiveDomIslandProjection,
  projectHtmlSurfaceActiveDomIsland,
} from "../htmlSurfaces/interactionProjector";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import { getVisibleFlowRect, type GpuViewportInput } from "../viewportMath";
import type {
  GpuFlowBrowserVisualActorRuntimeFrameIds,
  GpuFlowBrowserVisualActorRuntimeSnapshot,
} from "./browserVisualActorRuntime";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import { DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS } from "./domControlProjectionHorizon";

const GPU_FLOW_DOM_CONTROL_HOST_RETAINED_PREVIOUS_LIMIT =
  DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxReadableMountedControls +
  DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxOverscanMountedControls;

export function resolveGpuFlowBrowserVisualActorFrameIds({
  committedFrameId,
  retainedRuntimeFrame,
}: {
  readonly committedFrameId: number | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
}): GpuFlowBrowserVisualActorRuntimeFrameIds {
  const runtimeFrameId = retainedRuntimeFrame?.frameId ?? 0;
  return Object.freeze({
    committedFrameId: committedFrameId ?? runtimeFrameId,
    runtimeFrameId,
  });
}

export function createGpuFlowDomControlProjectionSourceRevision({
  controls,
  frameIds,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
}): string {
  return JSON.stringify({
    committedFrameId: frameIds.committedFrameId,
    controls: controls.map((control) => [
      control.sourceId,
      control.sourceKey,
      control.active,
      control.visualPolicy,
      control.textCoverageRevision,
      control.sectionScrollRevision,
      control.viewportSampleRevision,
    ]),
    runtimeFrameId: frameIds.runtimeFrameId,
  });
}

export function isProjectableDomControlAssignment(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "live" ||
    assignment.coverageState === "compatible-previous"
  );
}

export function mergeGpuFlowDomControlProjectedControls({
  controlById,
  currentControls,
  nextControls,
}: {
  readonly controlById: ReadonlyMap<
    string,
    GpuRetainedDomControlSourceDescriptor
  >;
  readonly currentControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly nextControls: readonly GpuRetainedDomControlSourceDescriptor[];
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  if (currentControls.length === 0) {
    return nextControls;
  }
  const merged: GpuRetainedDomControlSourceDescriptor[] = [];
  const seen = new Set<string>();
  for (const control of nextControls) {
    merged.push(control);
    seen.add(control.sourceId);
  }
  for (const previousControl of currentControls) {
    if (merged.length >= GPU_FLOW_DOM_CONTROL_HOST_RETAINED_PREVIOUS_LIMIT) {
      break;
    }
    if (seen.has(previousControl.sourceId)) {
      continue;
    }
    const currentControl = controlById.get(previousControl.sourceId);
    if (!currentControl) {
      continue;
    }
    const retainedControl = canRetainPreviousGpuFlowDomControlDescriptor({
      currentControl,
      previousControl,
    })
      ? previousControl
      : currentControl;
    merged.push(retainedControl);
    seen.add(retainedControl.sourceId);
  }
  return merged;
}

export function areBrowserVisualActorRuntimeSnapshotsEqual(
  left: GpuFlowBrowserVisualActorRuntimeSnapshot,
  right: GpuFlowBrowserVisualActorRuntimeSnapshot,
): boolean {
  return (
    left.frameIds.committedFrameId === right.frameIds.committedFrameId &&
    left.frameIds.runtimeFrameId === right.frameIds.runtimeFrameId &&
    left.domControls.sourceRevision === right.domControls.sourceRevision &&
    areGpuFlowDomControlProjectedControlsEqual({
      leftAssignments: left.domControls.assignments,
      leftControls: left.domControls.mountedControls,
      leftSnapshotControls: left.domControls.snapshotControls,
      rightAssignments: right.domControls.assignments,
      rightControls: right.domControls.mountedControls,
      rightSnapshotControls: right.domControls.snapshotControls,
    }) &&
    areDomIslandListsEqual(left.domIslands.islands, right.domIslands.islands)
  );
}

function areDomControlListsEqual(
  left: readonly GpuRetainedDomControlSourceDescriptor[],
  right: readonly GpuRetainedDomControlSourceDescriptor[],
): boolean {
  return (
    left.length === right.length &&
    left.every((control, index) =>
      areDomControlDescriptorsEqual(control, right[index]),
    )
  );
}

export function syncGpuFlowBrowserVisualDomIslandLayerStyles({
  elementById,
  islands,
  viewport,
  viewportSize,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
  readonly viewport: GpuViewportInput;
  readonly viewportSize: { readonly height: number; readonly width: number };
}) {
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: viewportSize.height,
    canvasWidth: viewportSize.width,
    marginCssPx: 128,
    viewport,
  });
  for (const island of islands) {
    const element = elementById.get(island.id);
    if (!element) {
      continue;
    }
    if (!rectsIntersect(visibleFlowRect, island.rect)) {
      hideHtmlSurfaceActiveDomIslandProjection(element);
      element.style.pointerEvents = "none";
      continue;
    }
    applyHtmlSurfaceActiveDomIslandProjection({
      element,
      projection: projectHtmlSurfaceActiveDomIsland({
        flowRect: island.rect,
        viewport,
        zIndex: island.zIndex,
      }),
    });
  }
}

export function parkDomControlElement(element: HTMLElement): void {
  element.style.display = "none";
  element.style.pointerEvents = "none";
}

export function blurFocusedDescendantBeforeUnmount(element: HTMLElement) {
  const activeElement = element.ownerDocument.activeElement;
  if (activeElement instanceof HTMLElement && element.contains(activeElement)) {
    activeElement.blur();
  }
}

function canRetainPreviousGpuFlowDomControlDescriptor({
  currentControl,
  previousControl,
}: {
  readonly currentControl: GpuRetainedDomControlSourceDescriptor;
  readonly previousControl: GpuRetainedDomControlSourceDescriptor;
}): boolean {
  return (
    currentControl.sourceKey === previousControl.sourceKey &&
    currentControl.snapshotCacheKeyRevision ===
      previousControl.snapshotCacheKeyRevision &&
    currentControl.textCoverageRevision ===
      previousControl.textCoverageRevision &&
    currentControl.active === previousControl.active
  );
}

function areDomIslandListsEqual(
  left: readonly GpuDomIsland[],
  right: readonly GpuDomIsland[],
): boolean {
  return (
    left.length === right.length &&
    left.every((island, index) => areDomIslandsEqual(island, right[index]))
  );
}

function areDomIslandsEqual(
  left: GpuDomIsland,
  right: GpuDomIsland | undefined,
): boolean {
  return Boolean(
    right &&
      left.id === right.id &&
      left.kind === right.kind &&
      left.zIndex === right.zIndex &&
      rectsEqual(left.rect, right.rect),
  );
}

function areDomControlDescriptorsEqual(
  left: GpuRetainedDomControlSourceDescriptor,
  right: GpuRetainedDomControlSourceDescriptor | undefined,
): boolean {
  return Boolean(
    right &&
      left.sourceId === right.sourceId &&
      left.sourceKey === right.sourceKey &&
      left.snapshotCacheKeyRevision === right.snapshotCacheKeyRevision &&
      left.geometryRevision === right.geometryRevision &&
      left.textCoverageRevision === right.textCoverageRevision &&
      left.active === right.active,
  );
}

function areGpuFlowDomControlProjectedControlsEqual({
  leftAssignments,
  leftControls,
  leftSnapshotControls,
  rightAssignments,
  rightControls,
  rightSnapshotControls,
}: {
  readonly leftAssignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly leftControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly leftSnapshotControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly rightAssignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly rightControls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly rightSnapshotControls: readonly GpuRetainedDomControlSourceDescriptor[];
}): boolean {
  if (leftControls.length !== rightControls.length) {
    return false;
  }
  if (!areDomControlListsEqual(leftSnapshotControls, rightSnapshotControls)) {
    return false;
  }
  const leftAssignmentByControlId =
    createGpuFlowDomControlProjectionAssignmentMap(leftAssignments);
  const rightAssignmentByControlId =
    createGpuFlowDomControlProjectionAssignmentMap(rightAssignments);
  return leftControls.every(
    (control, index) =>
      control.sourceId === rightControls[index]?.sourceId &&
      areGpuFlowDomControlProjectionAssignmentsEqual(
        leftAssignmentByControlId.get(control.sourceId),
        rightAssignmentByControlId.get(control.sourceId),
      ),
  );
}

function createGpuFlowDomControlProjectionAssignmentMap(
  assignments: readonly GpuFlowDomControlProjectionAssignment[],
): ReadonlyMap<string, GpuFlowDomControlProjectionAssignment> {
  return new Map(
    assignments.map((assignment) => [assignment.control.sourceId, assignment]),
  );
}

function areGpuFlowDomControlProjectionAssignmentsEqual(
  left: GpuFlowDomControlProjectionAssignment | undefined,
  right: GpuFlowDomControlProjectionAssignment | undefined,
): boolean {
  return (
    createGpuFlowDomControlProjectionAssignmentEqualityKey(left) ===
    createGpuFlowDomControlProjectionAssignmentEqualityKey(right)
  );
}

function createGpuFlowDomControlProjectionAssignmentEqualityKey(
  assignment: GpuFlowDomControlProjectionAssignment | undefined,
): string {
  if (!assignment) {
    return "";
  }
  const compatibilityProof = assignment.compatibilityProof;
  return JSON.stringify([
    assignment.coverageState,
    assignment.phase,
    assignment.reason,
    compatibilityProof ? compatibilityProof.reasonCode : "",
  ]);
}

function rectsIntersect(
  left: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
  right: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function rectsEqual(
  left: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y">,
  right: Pick<GpuDomIsland["rect"], "height" | "width" | "x" | "y"> | undefined,
): boolean {
  return Boolean(
    right &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height,
  );
}
