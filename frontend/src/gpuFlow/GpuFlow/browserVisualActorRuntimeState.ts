import {
  createGpuFlowCommittedSurfaceDomPresentationEvidence,
  type GpuFlowCommittedSurfaceBrowserVisualReadiness,
  type GpuFlowCommittedSurfaceDomPresentationEvidence,
} from "../committedSurfaceFrame";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type {
  GpuFlowBrowserVisualActorRuntimeFrameIds,
  GpuFlowBrowserVisualActorRuntimeSnapshot,
} from "./browserVisualActorRuntime";
import { isGpuFlowDomControlSnapshotReady } from "./browserVisualActorRuntimeReadiness";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import { setGpuFlowVisibleFrameIdentityAttributes } from "./visibleFrameIdentityAttributes";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";

export type GpuFlowDomControlSnapshotTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "getCommittedSurfaceTexture"
>;

const EMPTY_DOM_CONTROL_DESCRIPTORS: readonly GpuRetainedDomControlSourceDescriptor[] =
  Object.freeze([]);
export const EMPTY_DOM_ISLANDS: readonly GpuDomIsland[] = Object.freeze([]);

const GPU_FLOW_BROWSER_VISUAL_LIVE_PREPARATION_BATCH_SIZE = 4;
const GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_PREPARATION_BATCH_SIZE = 64;
const GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_STAGE_BATCH_SIZE = 4;

export function createEmptyBrowserVisualActorRuntimeSnapshot(): GpuFlowBrowserVisualActorRuntimeSnapshot {
  const frameIds = Object.freeze({
    committedFrameId: 0,
    runtimeFrameId: 0,
  });
  return Object.freeze({
    domControls: Object.freeze({
      assignments: Object.freeze([]),
      controlById: new Map(),
      controls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      mountedControls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      snapshotControls: EMPTY_DOM_CONTROL_DESCRIPTORS,
      sourceRevision: "",
    }),
    domIslands: Object.freeze({
      islands: EMPTY_DOM_ISLANDS,
    }),
    frameIds,
    publicationToken: null,
  });
}

export function withGpuFlowBrowserVisualSnapshotPublicationToken({
  snapshot,
  token,
}: {
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
  readonly token: GpuFlowCommitPublicationToken;
}): GpuFlowBrowserVisualActorRuntimeSnapshot {
  return Object.freeze({
    ...snapshot,
    publicationToken: token,
  });
}

export function createGpuFlowBrowserVisualCandidatePresentationEvidence({
  candidateId,
  frameIds,
  readiness,
  snapshot,
}: {
  readonly candidateId: string;
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
  readonly readiness: GpuFlowCommittedSurfaceBrowserVisualReadiness;
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
}): GpuFlowCommittedSurfaceDomPresentationEvidence {
  return createGpuFlowCommittedSurfaceDomPresentationEvidence({
    browserVisualCandidateId: candidateId,
    committedFrameId: frameIds.committedFrameId,
    domControlMountedCount: snapshot.domControls.mountedControls.length,
    domControlSnapshotCount: snapshot.domControls.snapshotControls.length,
    domIslandCount: snapshot.domIslands.islands.length,
    exposable: isGpuFlowBrowserVisualReadinessExposable(readiness),
    runtimeFrameId: frameIds.runtimeFrameId,
    source: "browser-visual-runtime-candidate",
    staged: true,
  });
}

function isGpuFlowBrowserVisualReadinessExposable(
  readiness: GpuFlowCommittedSurfaceBrowserVisualReadiness,
): boolean {
  return [
    ...readiness.domControlReadinessByActorId.values(),
    ...readiness.domIslandReadinessByActorId.values(),
  ].every(
    (entry) =>
      entry.coverageState !== "blocked-awaiting-live-host" &&
      entry.coverageState !== "blocked-awaiting-snapshot",
  );
}

export function resolveGpuFlowDomControlLiveHostPreparationStage({
  isDomControlHostReady,
  preparedDomControls,
  token,
}: {
  readonly isDomControlHostReady: (
    control: GpuRetainedDomControlSourceDescriptor,
  ) => boolean;
  readonly preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"];
  readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const requestedActorIds = getGpuFlowBrowserVisualRepairActorIds(token);
  const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
  const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const control of preparedDomControls.mountedControls) {
    if (isDomControlHostReady(control)) {
      readyControls.push(control);
      continue;
    }
    if (requestedActorIds && !requestedActorIds.has(control.sourceId)) {
      continue;
    }
    pendingControls.push(control);
  }
  return Object.freeze([
    ...readyControls,
    ...pendingControls.slice(
      0,
      GPU_FLOW_BROWSER_VISUAL_LIVE_PREPARATION_BATCH_SIZE,
    ),
  ]);
}

export function resolveGpuFlowDomControlSnapshotPreparationStage({
  domControlSnapshotElementBySurfaceId,
  domControlSnapshotTextureManager,
  preparedDomControls,
  token,
}: {
  readonly domControlSnapshotElementBySurfaceId: ReadonlyMap<
    string,
    HTMLElement
  >;
  readonly domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager | null;
  readonly preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"];
  readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const requestedActorIds = getGpuFlowBrowserVisualRepairActorIds(token);
  const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
  const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const control of preparedDomControls.snapshotControls) {
    if (
      isGpuFlowDomControlSnapshotReady({
        control,
        domControlSnapshotElementBySurfaceId,
        domControlSnapshotTextureManager,
      })
    ) {
      readyControls.push(control);
      continue;
    }
    if (requestedActorIds && !requestedActorIds.has(control.sourceId)) {
      continue;
    }
    pendingControls.push(control);
  }
  return Object.freeze([
    ...readyControls,
    ...pendingControls.slice(
      0,
      GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_STAGE_BATCH_SIZE,
    ),
  ]);
}

export function resolveGpuFlowDomControlSnapshotPreparationPool({
  assignments,
  domControlSnapshotElementBySurfaceId,
  domControlSnapshotTextureManager,
}: {
  readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly domControlSnapshotElementBySurfaceId: ReadonlyMap<
    string,
    HTMLElement
  >;
  readonly domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager | null;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const readyControls: GpuRetainedDomControlSourceDescriptor[] = [];
  const pendingControls: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const assignment of assignments) {
    if (!isDomControlSnapshotPreparationAssignment(assignment)) {
      continue;
    }
    if (
      isGpuFlowDomControlSnapshotReady({
        control: assignment.control,
        domControlSnapshotElementBySurfaceId,
        domControlSnapshotTextureManager,
      })
    ) {
      readyControls.push(assignment.control);
    } else {
      pendingControls.push(assignment.control);
    }
  }
  return Object.freeze([
    ...readyControls,
    ...pendingControls.slice(
      0,
      GPU_FLOW_BROWSER_VISUAL_SNAPSHOT_PREPARATION_BATCH_SIZE,
    ),
  ]);
}

function isDomControlSnapshotPreparationAssignment(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "snapshot" ||
    assignment.coverageState === "blocked-awaiting-browser-visual" ||
    (assignment.coverageState === "blocked-awaiting-live-host" &&
      assignment.reason === "live-host-overflow" &&
      !assignment.control.active)
  );
}

function getGpuFlowBrowserVisualRepairActorIds(
  token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken,
): ReadonlySet<string> | null {
  if (!("blockedReasons" in token)) {
    return null;
  }
  const actorIds = token.blockedReasons.flatMap((reason) =>
    reason.actorId === null ? [] : [reason.actorId],
  );
  return actorIds.length > 0 ? new Set(actorIds) : null;
}

export function applyVisibleGpuFlowDomControlHostPresentation({
  control,
  element,
  token,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  setGpuFlowVisibleFrameIdentityAttributes(element, token);
  element.dataset.gpuFlowDomControl = "true";
  delete element.dataset.gpuFlowDomControlPreparation;
  element.dataset.gpuFlowDomControlId = control.sourceId;
  element.dataset.gpuFlowDomControlFocusable = control.visualSemantics.focusable
    ? "true"
    : "false";
  element.dataset.gpuFlowDomControlPointerSemantics =
    control.visualSemantics.pointer;
  element.dataset.gpuFlowDomControlRowId = control.rowId;
  element.dataset.gpuFlowDomControlSelectable =
    control.visualSemantics.selectable;
  element.dataset.gpuFlowDomControlSectionId = control.sectionId;
  element.dataset.gpuFlowDomControlSurfaceId = control.surfaceId;
  element.dataset.gpuFlowDomControlActive = control.active ? "true" : "false";
  if (control.visualSemantics.accessibility === "visual-only-aria-hidden") {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
  element.style.removeProperty("opacity");
  element.style.removeProperty("pointer-events");
  element.style.removeProperty("transform");
  element.style.removeProperty("visibility");
}
