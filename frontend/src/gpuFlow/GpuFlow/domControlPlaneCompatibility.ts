import type { GpuFlowTextControlCompatibilityProof } from "../projectionRuntime";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRect } from "../viewportMath";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import { DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS } from "./domControlProjectionHorizon";

export type GpuFlowDomControlPromotedRepresentation = {
  readonly compatiblePreviousFrameCount: number;
  readonly control: GpuRetainedDomControlSourceDescriptor;
};

export function resolveGpuFlowDomControlCompatiblePreviousAssignments({
  assignments,
  promotedRepresentationByControlId,
}: {
  readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly promotedRepresentationByControlId: ReadonlyMap<
    string,
    GpuFlowDomControlPromotedRepresentation
  >;
}): readonly GpuFlowDomControlProjectionAssignment[] {
  let remainingCompatiblePreviousBudget =
    DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxCompatiblePreviousControls;
  return assignments.map((assignment) => {
    if (
      remainingCompatiblePreviousBudget <= 0 ||
      !canUseGpuFlowDomControlCompatiblePreviousCoverage(assignment)
    ) {
      return assignment;
    }
    const previous = promotedRepresentationByControlId.get(
      assignment.control.sourceId,
    );
    if (!isCompatiblePreviousCarryAllowed(previous)) {
      return assignment;
    }
    const proof = createGpuFlowDomControlCompatiblePreviousProof({
      current: assignment.control,
      previous: previous.control,
    });
    if (!proof) {
      return assignment;
    }
    remainingCompatiblePreviousBudget -= 1;
    return {
      ...assignment,
      compatibilityProof: proof,
      coverageState: "compatible-previous",
      phase: "project",
      reason: "compatible-previous-proof",
    };
  });
}

function canUseGpuFlowDomControlCompatiblePreviousCoverage(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "blocked-awaiting-browser-visual" ||
    assignment.coverageState === "blocked-awaiting-live-host"
  );
}

export function createGpuFlowDomControlPromotedRepresentationMap({
  assignments,
  previousRepresentationByControlId,
}: {
  readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
  readonly previousRepresentationByControlId: ReadonlyMap<
    string,
    GpuFlowDomControlPromotedRepresentation
  >;
}): Map<string, GpuFlowDomControlPromotedRepresentation> {
  const promotedRepresentationByControlId = new Map<
    string,
    GpuFlowDomControlPromotedRepresentation
  >();
  for (const assignment of assignments) {
    if (!isPromotedDomControlRepresentation(assignment)) {
      continue;
    }
    const previous = previousRepresentationByControlId.get(
      assignment.control.sourceId,
    );
    promotedRepresentationByControlId.set(assignment.control.sourceId, {
      compatiblePreviousFrameCount:
        assignment.coverageState === "compatible-previous"
          ? (previous?.compatiblePreviousFrameCount ?? 0) + 1
          : 0,
      control: assignment.control,
    });
  }
  return promotedRepresentationByControlId;
}

function isCompatiblePreviousCarryAllowed(
  previous: GpuFlowDomControlPromotedRepresentation | undefined,
): previous is GpuFlowDomControlPromotedRepresentation {
  return Boolean(
    previous &&
      previous.compatiblePreviousFrameCount <
        DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxCompatiblePreviousFrames,
  );
}

function isPromotedDomControlRepresentation(
  assignment: GpuFlowDomControlProjectionAssignment,
): boolean {
  return (
    assignment.coverageState === "live" ||
    assignment.coverageState === "compatible-previous"
  );
}

export function createGpuFlowDomControlCompatiblePreviousProof({
  current,
  previous,
}: {
  readonly current: GpuRetainedDomControlSourceDescriptor;
  readonly previous: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowTextControlCompatibilityProof | null {
  if (!isGpuFlowDomControlCompatiblePreviousCandidate({ current, previous })) {
    return null;
  }
  return {
    activationPolicy: current.active ? "allowed" : "requires-current-visual",
    actorId: current.sourceId,
    clipChainRevision: current.clipChainRevision,
    controlKind: current.editorKind,
    displayRevision: current.valueStyleRevision,
    flowRect: Object.freeze({ ...current.worldRectFlowPx }),
    focusState: current.active ? "focused" : "inactive",
    hitTargetId: current.controlId,
    reasonCode: "same-value-and-geometry",
    retainedScrollCompatible: true,
    retainedSurfaceId: current.surfaceId,
    semanticGenerationId: createGpuFlowDomControlSemanticProofKey(current),
    visualGenerationId: createGpuFlowDomControlVisualProofKey(current),
  };
}

function isGpuFlowDomControlCompatiblePreviousCandidate({
  current,
  previous,
}: {
  readonly current: GpuRetainedDomControlSourceDescriptor;
  readonly previous: GpuRetainedDomControlSourceDescriptor;
}): boolean {
  return [
    current.sourceId === previous.sourceId,
    current.sourceKey === previous.sourceKey,
    current.controlId === previous.controlId,
    current.rowId === previous.rowId,
    current.surfaceId === previous.surfaceId,
    current.sectionId === previous.sectionId,
    current.editorKind === previous.editorKind,
    current.linePolicy === previous.linePolicy,
    current.wrapLines === previous.wrapLines,
    current.defaultValue === previous.defaultValue,
    current.disabled === previous.disabled,
    current.error === previous.error,
    current.value === previous.value,
    current.valueStyleRevision === previous.valueStyleRevision,
    current.textCoverageRevision === previous.textCoverageRevision,
    current.snapshotCacheKeyRevision === previous.snapshotCacheKeyRevision,
    current.clipChainRevision === previous.clipChainRevision,
    current.geometryRevision === previous.geometryRevision,
    current.sectionScrollRevision === previous.sectionScrollRevision,
    current.active === previous.active,
    current.visualSemantics.accessibility ===
      previous.visualSemantics.accessibility,
    current.visualSemantics.focusable === previous.visualSemantics.focusable,
    current.visualSemantics.pointer === previous.visualSemantics.pointer,
    current.visualSemantics.selectable === previous.visualSemantics.selectable,
    rectsEqual(current.worldRectFlowPx, previous.worldRectFlowPx),
    rectsEqual(current.sourceRectCssPx, previous.sourceRectCssPx),
    rectsEqual(
      current.controlRectSurfaceCssPx,
      previous.controlRectSurfaceCssPx,
    ),
    rectsEqual(current.clipRectSurfaceCssPx, previous.clipRectSurfaceCssPx),
    rectsEqual(current.sectionClipRectFlowPx, previous.sectionClipRectFlowPx),
  ].every(Boolean);
}

function createGpuFlowDomControlSemanticProofKey(
  control: GpuRetainedDomControlSourceDescriptor,
): string {
  return [
    "text-like-dom-semantic",
    control.sourceId,
    control.value,
    control.defaultValue,
    control.disabled,
    control.error,
    control.textCoverageRevision,
  ].join("|");
}

function createGpuFlowDomControlVisualProofKey(
  control: GpuRetainedDomControlSourceDescriptor,
): string {
  return [
    control.visualPolicy === "snapshot"
      ? "text-like-snapshot-visual"
      : "text-like-dom-visual",
    control.sourceId,
    control.snapshotSurfaceId ?? "surface:none",
    control.snapshotCacheKeyRevision,
    control.textCoverageRevision,
  ].join("|");
}

function rectsEqual(left: GpuRect, right: GpuRect): boolean {
  return [
    left.x === right.x,
    left.y === right.y,
    left.width === right.width,
    left.height === right.height,
  ].every(Boolean);
}
