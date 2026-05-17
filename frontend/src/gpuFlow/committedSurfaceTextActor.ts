import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceTextCoverageProof,
  GpuFlowTextActorActivationPolicy,
} from "./committedSurfaceFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuRect } from "./viewportMath";

export function createDomControlActors(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame,
): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    retainedRuntimeFrame.descriptors.domControlSources.map((control) =>
      domControlToActor({ control }),
    ),
  );
}

function domControlToActor({
  control,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowCommittedSurfaceActorGeneration {
  const projected = isProjectedDomControl(control);
  const retainedScrollRevision = control.sectionScrollRevision;
  const contentGenerationId = [
    "dom-control-content",
    control.sourceId,
    control.sourceKey,
    control.valueStyleRevision,
  ].join("|");
  const layoutProjectionGenerationId = [
    "dom-control-layout",
    control.sourceId,
    control.clipChainRevision,
    control.geometryRevision,
    retainedScrollRevision,
  ].join("|");
  const readinessGenerationId = createDomControlReadinessGenerationId({
    control,
    projected,
  });
  const visualGenerationId = createDomControlVisualGenerationId(control);
  const semanticGenerationId = createDomControlSemanticGenerationId(control);
  const activationPolicy = getDomControlActivationPolicy(control);
  const hasProjectionVisual = hasDomControlProjectionVisual({
    control,
    projected,
  });
  return freezeDomControlActor({
    active: control.active,
    accessibilityProjection: "browser-dom",
    activationPolicy,
    actorFamily: "text-like-dom-control",
    actorId: control.sourceId,
    clipChainRevision: control.clipChainRevision,
    clipRect: control.sectionClipRectFlowPx,
    contentGenerationId,
    controlId: control.controlId,
    focusIdentity: getDomControlFocusIdentity(control),
    flowRect: control.worldRectFlowPx,
    generationId: [
      contentGenerationId,
      layoutProjectionGenerationId,
      readinessGenerationId,
    ].join("|"),
    islandId: null,
    kind: "dom-control",
    layoutProjectionGenerationId,
    liveMotionSampleId: control.viewportSampleRevision,
    mountReadiness: hasProjectionVisual ? "ready" : "not-required",
    ownerSurfaceId: control.surfaceId,
    pointerEvents: getDomControlPointerEvents({ control, projected }),
    projectionReadiness: hasProjectionVisual ? "ready" : "not-required",
    readinessGenerationId,
    retainedScrollOffset: control.sectionScrollOffset,
    retainedScrollRevision,
    rowId: control.rowId,
    semanticGenerationId,
    sourceRect: control.sourceRectCssPx,
    textCoverageProof: createDomControlTextCoverageProof({
      activationPolicy,
      control,
      projected,
      semanticGenerationId,
      visualGenerationId,
    }),
    textSnapshotCacheKeyRevision: control.snapshotCacheKeyRevision,
    valueStyleRevision: control.valueStyleRevision,
    visibleNonempty: hasVisibleNonemptyDomControlText(control),
    visualGenerationId,
    wheelPolicy: control.interactionPolicy.wheel,
    zOrder: control.zOrder,
  });
}

function isProjectedDomControl(
  control: GpuRetainedDomControlSourceDescriptor,
): boolean {
  return (
    control.clipRectSurfaceCssPx.width > 0 &&
    control.clipRectSurfaceCssPx.height > 0
  );
}

function hasDomControlProjectionVisual({
  control,
  projected,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly projected: boolean;
}): boolean {
  return (
    projected &&
    (control.visualPolicy === "live-dom" || control.visualPolicy === "snapshot")
  );
}

function getDomControlFocusIdentity(
  control: GpuRetainedDomControlSourceDescriptor,
): string | null {
  return control.active ? control.sourceId : null;
}

function getDomControlPointerEvents({
  control,
  projected,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly projected: boolean;
}): "auto" | "none" {
  return projected && control.active ? "auto" : "none";
}

function hasVisibleNonemptyDomControlText(
  control: GpuRetainedDomControlSourceDescriptor,
): boolean {
  return (
    control.value.length > 0 &&
    control.projectionVisibility === "viewport-visible"
  );
}

function createDomControlReadinessGenerationId({
  control,
  projected,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly projected: boolean;
}): string {
  return [
    "dom-control-readiness",
    control.sourceId,
    control.lifecycleState,
    control.visualPolicy,
    projected ? "projected" : "clipped",
  ].join("|");
}

function createDomControlVisualGenerationId(
  control: GpuRetainedDomControlSourceDescriptor,
): string {
  return [
    control.visualPolicy === "snapshot"
      ? "text-like-snapshot-visual"
      : "text-like-dom-visual",
    control.sourceId,
    control.snapshotSurfaceId ?? "surface:none",
    control.snapshotCacheKeyRevision,
  ].join("|");
}

function createDomControlSemanticGenerationId(
  control: GpuRetainedDomControlSourceDescriptor,
): string {
  return [
    "text-like-dom-semantic",
    control.sourceId,
    control.value,
    control.defaultValue,
    control.disabled,
    control.error,
  ].join("|");
}

function getDomControlActivationPolicy(
  control: GpuRetainedDomControlSourceDescriptor,
): GpuFlowTextActorActivationPolicy {
  if (control.active) {
    return "allowed";
  }
  if (
    control.visualPolicy === "blocked-awaiting-browser-visual" ||
    control.visualPolicy === "outside-viewport"
  ) {
    return "queue-until-ready";
  }
  return "requires-current-visual";
}

function createDomControlTextCoverageProof({
  activationPolicy,
  control,
  projected,
  semanticGenerationId,
  visualGenerationId,
}: {
  readonly activationPolicy: GpuFlowTextActorActivationPolicy;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly projected: boolean;
  readonly semanticGenerationId: string;
  readonly visualGenerationId: string;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  const base = {
    accessibilityProjection: "browser-dom" as const,
    activationPolicy,
    focusable: control.visualSemantics.focusable,
    pointerSemantics: control.visualSemantics.pointer,
    rendererFamily: control.rendererFamily,
    rendererSource: "browser-dom" as const,
    role: control.role,
    selectable: control.visualSemantics.selectable,
    semanticGenerationId,
    snapshotCacheKeyRevision: control.snapshotCacheKeyRevision,
    visualGenerationId,
  };
  if (!projected) {
    return {
      ...base,
      projectionCoverage: "true-hole",
      readinessReason: "clipped-empty",
    };
  }
  return createProjectedDomControlTextCoverageProof({ base, control });
}

function createProjectedDomControlTextCoverageProof({
  base,
  control,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  switch (control.visualPolicy) {
    case "live-dom":
      return {
        ...base,
        projectionCoverage: "exact-live-dom",
      };
    case "snapshot":
      return control.snapshotSurfaceId
        ? {
            ...base,
            projectionCoverage: "exact-snapshot",
            snapshotSurfaceId: control.snapshotSurfaceId,
          }
        : {
            ...base,
            projectionCoverage: "true-hole",
            readinessReason: "missing-browser-visual",
          };
    case "blocked-awaiting-browser-visual":
      return {
        ...base,
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "live-dom-budget",
      };
    case "outside-viewport":
      return {
        ...base,
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      };
    case "clipped-empty":
      return {
        ...base,
        projectionCoverage: "true-hole",
        readinessReason: "clipped-empty",
      };
  }
}

function freezeDomControlActor(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowCommittedSurfaceActorGeneration {
  return Object.freeze({
    ...actor,
    clipRect: freezeRect(actor.clipRect),
    flowRect: freezeRect(actor.flowRect),
    retainedScrollOffset: actor.retainedScrollOffset
      ? Object.freeze({ ...actor.retainedScrollOffset })
      : null,
    sourceRect: freezeRect(actor.sourceRect),
    textCoverageProof: actor.textCoverageProof
      ? Object.freeze({ ...actor.textCoverageProof })
      : null,
  });
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}
