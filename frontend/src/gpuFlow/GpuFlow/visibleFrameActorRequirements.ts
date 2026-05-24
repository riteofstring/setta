import { isGpuFlowCommittedSurfaceCompletenessBlockingActor } from "../committedSurfaceCompleteness";
import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { readGpuFlowBrowserVisualFaultInjection } from "./visibleFrameActorAdapters/browserVisualFaultInjection";

export type GpuFlowVisibleFrameCommittedActorRequirement =
  | "maintenance"
  | "required";

export function getGpuFlowVisibleFrameCommittedActorRequirement({
  activeEditorPublicationPending,
  actor,
  startup,
}: {
  readonly activeEditorPublicationPending: boolean;
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly startup: boolean;
}): GpuFlowVisibleFrameCommittedActorRequirement {
  if (
    isGpuFlowVisibleFramePassiveLiveDomBudgetActor(actor) ||
    isGpuFlowVisibleFramePassiveSnapshotPendingActor({ actor, startup }) ||
    isGpuFlowVisibleFramePassiveSnapshotPendingDuringActiveEditor({
      activeEditorPublicationPending,
      actor,
    })
  ) {
    return "maintenance";
  }
  return "required";
}

export function hasGpuFlowVisibleFrameActiveEditorPublication(
  frame: GpuFlowCommittedSurfaceFrame,
): boolean {
  return (frame.actorGenerations ?? []).some(
    (actor) =>
      actor.visibleNonempty &&
      isGpuFlowVisibleFrameActiveEditorRepresentation(actor),
  );
}

export function isGpuFlowVisibleFrameActiveEditorRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  return (
    actor.active || actor.browserVisual?.representationKind === "active-editor"
  );
}

function isGpuFlowVisibleFramePassiveLiveDomBudgetActor(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  return (
    !hasGpuFlowBrowserVisualReadinessFaultInjection(actor) &&
    !isGpuFlowVisibleFrameActiveEditorRepresentation(actor) &&
    hasGpuFlowVisibleFrameTextCoverage({
      actor,
      projectionCoverage: "blocked-awaiting-live-host",
      readinessReason: "live-dom-budget",
    })
  );
}

function isGpuFlowVisibleFramePassiveSnapshotPendingActor({
  actor,
  startup,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly startup: boolean;
}): boolean {
  return (
    !startup &&
    !hasGpuFlowBrowserVisualReadinessFaultInjection(actor) &&
    !isGpuFlowCommittedSurfaceCompletenessBlockingActor({ actor, startup }) &&
    hasGpuFlowVisibleFrameTextCoverage({
      actor,
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    })
  );
}

function isGpuFlowVisibleFramePassiveSnapshotPendingDuringActiveEditor({
  activeEditorPublicationPending,
  actor,
}: {
  readonly activeEditorPublicationPending: boolean;
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
}): boolean {
  return (
    activeEditorPublicationPending &&
    !hasGpuFlowBrowserVisualReadinessFaultInjection(actor) &&
    !isGpuFlowVisibleFrameActiveEditorRepresentation(actor) &&
    hasGpuFlowVisibleFrameTextCoverage({
      actor,
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    })
  );
}

function hasGpuFlowBrowserVisualReadinessFaultInjection(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  return (
    actor.browserVisual?.readinessFaultInjected === true ||
    readGpuFlowBrowserVisualFaultInjection() !== null
  );
}

function hasGpuFlowVisibleFrameTextCoverage({
  actor,
  projectionCoverage,
  readinessReason,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly projectionCoverage: NonNullable<
    GpuFlowCommittedSurfaceActorGeneration["textCoverageProof"]
  >["projectionCoverage"];
  readonly readinessReason: string;
}): boolean {
  const textCoverage = actor.textCoverageProof;
  if (!textCoverage || textCoverage.projectionCoverage !== projectionCoverage) {
    return false;
  }
  return (
    "readinessReason" in textCoverage &&
    textCoverage.readinessReason === readinessReason
  );
}
