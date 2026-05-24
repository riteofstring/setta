import {
  applyHtmlSurfaceActiveDomIslandProjection,
  hideHtmlSurfaceActiveDomIslandProjection,
  projectHtmlSurfaceActiveDomIsland,
} from "../htmlSurfaces/interactionProjector";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import type { BrowserVisualActorRepresentationReadiness } from "../surfaceCompositor/browserVisualActorAdapter";
import { getVisibleFlowRect, type GpuViewportInput } from "../viewportMath";
import type {
  GpuFlowBrowserVisualActorRuntimeFrameIds,
  GpuFlowBrowserVisualActorRuntimeSnapshot,
} from "./browserVisualActorRuntime";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import { DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS } from "./domControlProjectionHorizon";
import {
  clearGpuFlowVisibleFrameIdentityAttributes,
  setGpuFlowVisibleFrameIdentityAttributes,
} from "./visibleFrameIdentityAttributes";
import {
  assertGpuFlowCommitPublicationTokenForFrameId,
  type GpuFlowCommitPublicationToken,
} from "./visibleFramePresentationProofs";

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

export function resolveGpuFlowBrowserVisualActorProjectionViewport({
  committedFrameId,
  projectionInput,
}: {
  readonly committedFrameId: number;
  readonly projectionInput:
    | {
        readonly token: GpuFlowCommitPublicationToken;
        readonly viewport?: GpuViewportInput | undefined;
      }
    | undefined;
}): GpuViewportInput | undefined {
  if (!projectionInput) {
    throw new Error(
      "GPU Flow current browser visual projection requires a commit publication token.",
    );
  }
  assertGpuFlowCommitPublicationTokenForFrameId({
    committedFrameId,
    token: projectionInput.token,
  });
  return projectionInput.viewport;
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

export function createGpuFlowCompatiblePreviousDomControlReadiness({
  assignment,
}: {
  readonly assignment: GpuFlowDomControlProjectionAssignment;
}): BrowserVisualActorRepresentationReadiness | null {
  if (!assignment.compatibilityProof) {
    return null;
  }
  return Object.freeze({
    compatibilityProof: assignment.compatibilityProof,
    coverageState: "compatible-previous-ready" as const,
  });
}

export function addSetValue<T>(set: Set<T>, value: T): boolean {
  if (set.has(value)) {
    return false;
  }
  set.add(value);
  return true;
}

export function deleteSetValue<T>(set: Set<T>, value: T): boolean {
  return set.delete(value);
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

export function publishGpuFlowBrowserVisualDomIslandHostPresentation({
  elementById,
  registrationCommittedFrameIdById,
  snapshot,
  token,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly registrationCommittedFrameIdById: Map<string, number>;
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  const visibleIslandIds = new Set(
    snapshot.domIslands.islands.map((island) => island.id),
  );
  for (const island of snapshot.domIslands.islands) {
    const element = elementById.get(island.id);
    if (!element) {
      continue;
    }
    element.dataset.gpuFlowDomIsland = "true";
    setGpuFlowVisibleFrameIdentityAttributes(element, token);
    delete element.dataset.gpuFlowDomIslandPreparation;
    element.style.removeProperty("opacity");
    element.style.removeProperty("visibility");
    registrationCommittedFrameIdById.set(island.id, token.committedFrameId);
  }
  for (const islandId of [...registrationCommittedFrameIdById.keys()]) {
    if (visibleIslandIds.has(islandId)) {
      continue;
    }
    const element = elementById.get(islandId);
    if (element) {
      element.style.display = "none";
      element.style.pointerEvents = "none";
      delete element.dataset.gpuFlowDomIsland;
      clearGpuFlowVisibleFrameIdentityAttributes(element);
    }
    registrationCommittedFrameIdById.delete(islandId);
  }
}

export function stampGpuFlowVisibleDomControlHostPresentationIdentity({
  hostByControlId,
  token,
}: {
  readonly hostByControlId: ReadonlyMap<
    string,
    { readonly element: HTMLElement }
  >;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  for (const host of hostByControlId.values()) {
    setGpuFlowVisibleFrameIdentityAttributes(host.element, token);
  }
}

export function stampGpuFlowVisibleDomIslandHostPresentationIdentity({
  elementById,
  registeredIslandIds,
  token,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly registeredIslandIds: Iterable<string>;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  for (const islandId of registeredIslandIds) {
    const element = elementById.get(islandId);
    if (!element) {
      continue;
    }
    setGpuFlowVisibleFrameIdentityAttributes(element, token);
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
