import { getGpuRetainedDomControlResolvedSnapshotSurfaceId } from "../GpuFlow/retainedDomControlSources";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type {
  BrowserActorBlockedReason,
  BrowserTextActorRepresentation,
  BrowserVisualActorCompatiblePreviousProof,
  BrowserVisualActorCoverageState,
  HostId,
} from "./browserVisualActorAdapter";

export function createDomControlTextActorRepresentation({
  compatiblePreviousProof,
  control,
  coverageState,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserTextActorRepresentation | null {
  if (coverageState === "coverage-exempt") {
    return null;
  }
  if (coverageState === "live-host-ready") {
    return createLiveHostDomControlTextActorRepresentation(control);
  }
  if (coverageState === "exact-snapshot-ready") {
    return createSnapshotDomControlTextActorRepresentation(control);
  }
  if (coverageState === "compatible-previous-ready") {
    return createCompatiblePreviousDomControlTextActorRepresentation({
      compatiblePreviousProof,
      control,
    });
  }
  return createBlockedDomControlTextActorRepresentation({
    control,
    reason: getBlockedDomControlTextActorRepresentationReason({
      control,
      coverageState,
    }),
  });
}

function createSnapshotDomControlTextActorRepresentation(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserTextActorRepresentation {
  return Object.freeze({
    actorId: control.sourceId,
    kind: "passive-snapshot",
    snapshotId: getGpuRetainedDomControlResolvedSnapshotSurfaceId(control),
  });
}

function createCompatiblePreviousDomControlTextActorRepresentation({
  compatiblePreviousProof,
  control,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): BrowserTextActorRepresentation {
  return Object.freeze({
    actorId: control.sourceId,
    kind: "compatible-previous",
    previousTransactionId:
      compatiblePreviousProof?.previousTransactionId ?? "unknown",
  });
}

function getBlockedDomControlTextActorRepresentationReason({
  control,
  coverageState,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserActorBlockedReason {
  if (coverageState === "blocked-awaiting-live-host") {
    return "live-dom-budget";
  }
  if (coverageState === "blocked-awaiting-snapshot") {
    return "snapshot-pending";
  }
  return getDomControlTrueHoleBlockedReason(control);
}

function createLiveHostDomControlTextActorRepresentation(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserTextActorRepresentation {
  if (control.active) {
    return Object.freeze({
      actorId: control.sourceId,
      hostId: createDomControlHostId(control),
      islandId: control.layerSlot,
      kind: "active-editor",
    });
  }
  return Object.freeze({
    actorId: control.sourceId,
    hostId: createDomControlHostId(control),
    kind: "passive-live-display",
  });
}

function createBlockedDomControlTextActorRepresentation({
  control,
  reason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly reason: BrowserActorBlockedReason;
}): BrowserTextActorRepresentation {
  return Object.freeze({
    actorId: control.sourceId,
    kind: "blocked",
    reason,
  });
}

function getDomControlTrueHoleBlockedReason(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserActorBlockedReason {
  return control.visualPolicy === "clipped-empty"
    ? "clipped-empty"
    : "missing-browser-visual";
}

function createDomControlHostId(
  control: GpuRetainedDomControlSourceDescriptor,
): HostId {
  return `dom-control-host:${control.sourceId}`;
}
