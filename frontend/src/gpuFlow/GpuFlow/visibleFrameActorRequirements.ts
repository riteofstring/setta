import { isGpuFlowPreparedContentCompletenessBlockingActor } from "../preparedContentCompleteness";
import type {
  GpuFlowPreparedContentActorGeneration,
  GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import { readGpuFlowBrowserVisualFaultInjection } from "./visibleFrameActorAdapters/browserVisualFaultInjection";

type GpuFlowVisibleFramePreparedActorRequirement = "maintenance" | "required";

export function getGpuFlowVisibleFramePreparedActorRequirement({
  activeEditorPresentationPending,
  actor,
  startup,
}: {
  readonly activeEditorPresentationPending: boolean;
  readonly actor: GpuFlowPreparedContentActorGeneration;
  readonly startup: boolean;
}): GpuFlowVisibleFramePreparedActorRequirement {
  if (
    isGpuFlowVisibleFramePassiveLiveDomBudgetActor(actor) ||
    isGpuFlowVisibleFramePassiveSnapshotPendingActor({ actor, startup }) ||
    isGpuFlowVisibleFramePassiveSnapshotPendingDuringActiveEditor({
      activeEditorPresentationPending,
      actor,
    })
  ) {
    return "maintenance";
  }
  return "required";
}

export function hasGpuFlowVisibleFrameActiveEditorPresentation(
  frame: GpuFlowPreparedContentFrame,
): boolean {
  return (frame.actorGenerations ?? []).some(
    (actor) =>
      actor.visibleNonempty &&
      isGpuFlowVisibleFrameActiveEditorRepresentation(actor),
  );
}

export function isGpuFlowVisibleFrameActiveEditorRepresentation(
  actor: GpuFlowPreparedContentActorGeneration,
): boolean {
  return (
    actor.active || actor.browserVisual?.representationKind === "active-editor"
  );
}

function isGpuFlowVisibleFramePassiveLiveDomBudgetActor(
  actor: GpuFlowPreparedContentActorGeneration,
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
  readonly actor: GpuFlowPreparedContentActorGeneration;
  readonly startup: boolean;
}): boolean {
  return (
    !startup &&
    !hasGpuFlowBrowserVisualReadinessFaultInjection(actor) &&
    !isGpuFlowPreparedContentCompletenessBlockingActor({ actor, startup }) &&
    hasGpuFlowVisibleFrameTextCoverage({
      actor,
      projectionCoverage: "blocked-awaiting-browser-visual",
      readinessReason: "snapshot-pending",
    })
  );
}

function isGpuFlowVisibleFramePassiveSnapshotPendingDuringActiveEditor({
  activeEditorPresentationPending,
  actor,
}: {
  readonly activeEditorPresentationPending: boolean;
  readonly actor: GpuFlowPreparedContentActorGeneration;
}): boolean {
  return (
    activeEditorPresentationPending &&
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
  actor: GpuFlowPreparedContentActorGeneration,
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
  readonly actor: GpuFlowPreparedContentActorGeneration;
  readonly projectionCoverage: NonNullable<
    GpuFlowPreparedContentActorGeneration["textCoverageProof"]
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
