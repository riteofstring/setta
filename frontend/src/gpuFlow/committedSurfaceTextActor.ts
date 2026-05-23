import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceActorGenerationInput,
  GpuFlowCommittedSurfaceCompatiblePreviousProof,
  GpuFlowCommittedSurfaceTextCoverageProof,
  GpuFlowTextActorActivationPolicy,
} from "./committedSurfaceFrame";
import { freezeActor } from "./committedSurfaceActorFreeze";
import { DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS } from "./GpuFlow/domControlProjectionHorizon";
import type { GpuFlowTextControlCompatibilityProof } from "./projectionRuntime";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import {
  createDomControlBrowserVisualActor,
  type BrowserVisualActor,
  type BrowserVisualActorRepresentationReadiness,
} from "./surfaceCompositor/browserVisualActorAdapter";
import type { BrowserVisualActorCompatiblePreviousProof } from "./surfaceCompositor/browserVisualActorProofTypes";

export type DomControlActorOptions = {
  readonly currentPublishedAtMs?: number | null;
  readonly previousCommittedSurfaceActors?:
    | readonly GpuFlowCommittedSurfaceActorGeneration[]
    | null;
  readonly previousPublishedAtMs?: number | null;
  readonly previousRetainedRuntimeFrame?: GpuRetainedRuntimeFrame | null;
  readonly previousCommittedFrameId?: number | null;
  readonly previousTransactionId?: string | null;
  readonly browserVisualReadinessByActorId?: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  > | null;
};

type DomControlActorSet = {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly browserVisualActors: readonly BrowserVisualActor[];
};

export function createDomControlActors(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame,
  options: DomControlActorOptions = {},
): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return createDomControlActorSet(retainedRuntimeFrame, options)
    .actorGenerations;
}

export function createDomControlActorSet(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame,
  options: DomControlActorOptions = {},
): DomControlActorSet {
  const previousControlById = createPreviousDomControlMap(
    options.previousRetainedRuntimeFrame,
  );
  const previousActorById = createPreviousDomControlActorMap(
    options.previousCommittedSurfaceActors,
  );
  const actorRecords = retainedRuntimeFrame.descriptors.domControlSources.map(
    (control) => {
      const representationReadiness =
        options.browserVisualReadinessByActorId?.get(control.sourceId) ?? null;
      return domControlToActorRecord({
        control,
        previousActor: previousActorById.get(control.sourceId),
        previousCommittedFrameId: options.previousCommittedFrameId ?? null,
        previousControl: previousControlById.get(control.sourceId),
        previousPublishedAtMs: options.previousPublishedAtMs ?? null,
        previousTransactionId: options.previousTransactionId ?? null,
        representationReadiness,
        requestedPublishedAtMs: options.currentPublishedAtMs ?? null,
        retainedRuntimeFrameId: retainedRuntimeFrame.frameId,
      });
    },
  );
  return Object.freeze({
    actorGenerations: Object.freeze(
      actorRecords.map((record) => record.actorGeneration),
    ),
    browserVisualActors: Object.freeze(
      actorRecords.map((record) => record.browserVisualActor),
    ),
  });
}

function domControlToActorRecord({
  control,
  previousActor,
  previousCommittedFrameId,
  previousControl,
  previousPublishedAtMs,
  previousTransactionId,
  requestedPublishedAtMs,
  representationReadiness,
  retainedRuntimeFrameId,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly previousActor: GpuFlowCommittedSurfaceActorGeneration | undefined;
  readonly previousCommittedFrameId: number | null;
  readonly previousControl: GpuRetainedDomControlSourceDescriptor | undefined;
  readonly previousPublishedAtMs: number | null;
  readonly previousTransactionId: string | null;
  readonly requestedPublishedAtMs: number | null;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly retainedRuntimeFrameId: number;
}): {
  readonly actorGeneration: GpuFlowCommittedSurfaceActorGeneration;
  readonly browserVisualActor: BrowserVisualActor;
} {
  const projected = isProjectedDomControl(control);
  const retainedScrollRevision = control.sectionScrollRevision;
  const contentGenerationId = [
    "dom-control-content",
    control.sourceId,
    control.sourceKey,
    control.valueStyleRevision,
    control.textCoverageRevision,
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
  const generationId = [
    contentGenerationId,
    layoutProjectionGenerationId,
    readinessGenerationId,
  ].join("|");
  const compatiblePreviousProof = createDomControlCompatiblePreviousCoverage({
    control,
    previousActor,
    previousCommittedFrameId,
    previousControl,
    previousPublishedAtMs,
    previousTransactionId,
    representationReadiness,
    requestedPublishedAtMs,
    requestedActorGenerationId: generationId,
    retainedRuntimeFrameId,
  });
  const visualGenerationId = createDomControlVisualGenerationId(control);
  const semanticGenerationId = createDomControlSemanticGenerationId(control);
  const activationPolicy = getDomControlActivationPolicy(control);
  const browserVisual = createDomControlBrowserVisualActor(control, {
    compatiblePreviousProof,
    representationReadiness,
  });
  const browserVisualCoverageReady =
    isDomControlBrowserVisualCoverageReady(browserVisual);
  const browserVisualCoverageRequired = browserVisual.coverageRequired.required;
  const browserVisualReadiness = getDomControlActorReadiness({
    coverageReady: browserVisualCoverageReady,
    coverageRequired: browserVisualCoverageRequired,
  });
  return Object.freeze({
    actorGeneration: freezeDomControlActor({
      active: control.active,
      accessibilityProjection: "browser-dom",
      activationPolicy,
      actorFamily: "text-like-dom-control",
      actorId: control.sourceId,
      browserVisual,
      clipChainRevision: control.clipChainRevision,
      clipRect: control.sectionClipRectFlowPx,
      contentGenerationId,
      controlId: control.controlId,
      focusIdentity: getDomControlFocusIdentity(control),
      flowRect: control.worldRectFlowPx,
      generationId,
      islandId: null,
      kind: "dom-control",
      layoutProjectionGenerationId,
      liveMotionSampleId: control.viewportSampleRevision,
      mountReadiness: browserVisualReadiness,
      ownerSurfaceId: control.surfaceId,
      pointerEvents: getDomControlPointerEvents({ control, projected }),
      projectionReadiness: browserVisualReadiness,
      readinessGenerationId,
      retainedScrollOffset: control.sectionScrollOffset,
      retainedScrollRevision,
      rowId: control.rowId,
      semanticGenerationId,
      sourceRect: control.sourceRectCssPx,
      textCoverageProof: createDomControlTextCoverageProof({
        activationPolicy,
        browserVisual,
        compatiblePreviousProof,
        control,
        projected,
        semanticGenerationId,
        visualGenerationId,
      }),
      textSnapshotCacheKeyRevision: control.snapshotCacheKeyRevision,
      valueStyleRevision: control.valueStyleRevision,
      visibleNonempty: browserVisualCoverageRequired,
      visualGenerationId,
      wheelPolicy: control.interactionPolicy.wheel,
      zOrder: control.zOrder,
    }),
    browserVisualActor: browserVisual,
  });
}

function createPreviousDomControlMap(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined,
): ReadonlyMap<string, GpuRetainedDomControlSourceDescriptor> {
  return new Map(
    retainedRuntimeFrame?.descriptors.domControlSources.map((control) => [
      control.sourceId,
      control,
    ]) ?? [],
  );
}

function createDomControlCompatiblePreviousCoverage({
  control,
  representationReadiness,
  previousActor,
  previousCommittedFrameId,
  previousControl,
  previousPublishedAtMs,
  previousTransactionId,
  requestedPublishedAtMs,
  requestedActorGenerationId,
  retainedRuntimeFrameId,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly previousActor: GpuFlowCommittedSurfaceActorGeneration | undefined;
  readonly previousCommittedFrameId: number | null;
  readonly previousControl: GpuRetainedDomControlSourceDescriptor | undefined;
  readonly previousPublishedAtMs: number | null;
  readonly previousTransactionId: string | null;
  readonly requestedPublishedAtMs: number | null;
  readonly requestedActorGenerationId: string;
  readonly retainedRuntimeFrameId: number;
}): BrowserVisualActorCompatiblePreviousProof | null {
  const proof =
    getDomControlCompatiblePreviousReadinessProof(representationReadiness);
  if (
    !previousControl ||
    !isCommittedDomControlCompatiblePreviousSourceReady(previousActor) ||
    previousCommittedFrameId === null ||
    !previousTransactionId ||
    !proof ||
    !canUseCommittedDomControlCompatiblePreviousCoverage({
      representationReadiness,
    })
  ) {
    return null;
  }
  const resourceHandles = Object.freeze(
    previousActor.browserVisual.resourceHandles.map((handle) =>
      Object.freeze({ ...handle }),
    ),
  );
  const proofBudget = createDomControlCompatiblePreviousProofBudget({
    previousCommittedFrameId,
    previousPublishedAtMs,
    requestedPublishedAtMs,
    retainedRuntimeFrameId,
  });
  if (proofBudget.budgetState === "over-budget") {
    return null;
  }
  return Object.freeze({
    activationPolicy: proof.activationPolicy,
    actorFamily: previousActor.actorFamily,
    actorId: proof.actorId,
    budgetState: proofBudget.budgetState,
    canonicalActorId: proof.canonicalActorId,
    clipChainRevision: proof.clipChainRevision,
    controlKind: proof.controlKind,
    displayRevision: proof.displayRevision,
    flowRect: Object.freeze({ ...proof.flowRect }),
    focusState: proof.focusState,
    hitMappingCompatible: proof.hitTargetId === previousActor.controlId,
    hitTargetId: proof.hitTargetId,
    maxProofAgeFrames: proofBudget.maxProofAgeFrames,
    maxProofAgeMs: proofBudget.maxProofAgeMs,
    previousActorGenerationId: previousActor.generationId,
    previousCommittedFrameId,
    previousProjectionSampleRevision: previousActor.liveMotionSampleId,
    previousTransactionId,
    previousVisualGenerationId:
      createDomControlVisualGenerationId(previousControl),
    proofAgeFrames: proofBudget.proofAgeFrames,
    proofAgeMs: proofBudget.proofAgeMs,
    protectedResourceIds: Object.freeze(
      resourceHandles.map((handle) => `${handle.kind}:${handle.id}`),
    ),
    reasonCode: proof.reasonCode,
    requestedActorGenerationId,
    requestedProjectionSampleRevision: control.viewportSampleRevision,
    requestedVisualGenerationId: proof.visualGenerationId,
    resourceHandles,
    retainedScrollCompatible: proof.retainedScrollCompatible,
    retainedSurfaceId: proof.retainedSurfaceId,
    semanticGenerationId: proof.semanticGenerationId,
  });
}

function getDomControlCompatiblePreviousReadinessProof(
  representationReadiness: BrowserVisualActorRepresentationReadiness | null,
): GpuFlowTextControlCompatibilityProof | null {
  if (representationReadiness?.coverageState !== "compatible-previous-ready") {
    return null;
  }
  return representationReadiness.compatibilityProof;
}

function createDomControlCompatiblePreviousProofBudget({
  previousCommittedFrameId,
  previousPublishedAtMs,
  requestedPublishedAtMs,
  retainedRuntimeFrameId,
}: {
  readonly previousCommittedFrameId: number;
  readonly previousPublishedAtMs: number | null;
  readonly requestedPublishedAtMs: number | null;
  readonly retainedRuntimeFrameId: number;
}): {
  readonly budgetState: "over-budget" | "within-budget";
  readonly maxProofAgeFrames: number;
  readonly maxProofAgeMs: number;
  readonly proofAgeFrames: number;
  readonly proofAgeMs: number | null;
} {
  const proofAgeFrames = Math.max(
    0,
    retainedRuntimeFrameId - previousCommittedFrameId,
  );
  const proofAgeMs = createDomControlCompatiblePreviousProofAgeMs({
    previousPublishedAtMs,
    requestedPublishedAtMs,
  });
  const maxProofAgeFrames =
    DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxCompatiblePreviousFrames;
  const maxProofAgeMs =
    DEFAULT_GPU_FLOW_DOM_CONTROL_PROJECTION_KNOBS.maxCompatiblePreviousMs;
  const budgetState = isDomControlCompatiblePreviousProofWithinBudget({
    maxProofAgeFrames,
    maxProofAgeMs,
    proofAgeFrames,
    proofAgeMs,
  })
    ? "within-budget"
    : "over-budget";
  return Object.freeze({
    budgetState,
    maxProofAgeFrames,
    maxProofAgeMs,
    proofAgeFrames,
    proofAgeMs,
  });
}

function createDomControlCompatiblePreviousProofAgeMs({
  previousPublishedAtMs,
  requestedPublishedAtMs,
}: {
  readonly previousPublishedAtMs: number | null;
  readonly requestedPublishedAtMs: number | null;
}): number | null {
  if (requestedPublishedAtMs === null || previousPublishedAtMs === null) {
    return null;
  }
  return Math.max(0, requestedPublishedAtMs - previousPublishedAtMs);
}

function isDomControlCompatiblePreviousProofWithinBudget({
  maxProofAgeFrames,
  maxProofAgeMs,
  proofAgeFrames,
  proofAgeMs,
}: {
  readonly maxProofAgeFrames: number;
  readonly maxProofAgeMs: number;
  readonly proofAgeFrames: number;
  readonly proofAgeMs: number | null;
}): boolean {
  if (proofAgeFrames > maxProofAgeFrames) {
    return false;
  }
  return proofAgeMs === null || proofAgeMs <= maxProofAgeMs;
}

function createPreviousDomControlActorMap(
  actors: readonly GpuFlowCommittedSurfaceActorGeneration[] | null | undefined,
): ReadonlyMap<string, GpuFlowCommittedSurfaceActorGeneration> {
  return new Map(
    actors
      ?.filter((actor) => actor.kind === "dom-control")
      .map((actor) => [actor.actorId, actor]) ?? [],
  );
}

function isCommittedDomControlCompatiblePreviousSourceReady(
  actor: GpuFlowCommittedSurfaceActorGeneration | undefined,
): actor is GpuFlowCommittedSurfaceActorGeneration & {
  readonly browserVisual: NonNullable<
    GpuFlowCommittedSurfaceActorGeneration["browserVisual"]
  >;
} {
  return Boolean(
    actor &&
      actor.browserVisual &&
      actor.browserVisual.coverageRequired.required &&
      actor.mountReadiness === "ready" &&
      actor.projectionReadiness === "ready" &&
      actor.browserVisual.resourceHandles.length > 0 &&
      isCommittedDomControlExactBrowserVisualCoverageReady(
        actor.textCoverageProof?.projectionCoverage,
      ) &&
      isCommittedDomControlExactBrowserVisualReady(
        actor.browserVisual.coverageState,
      ),
  );
}

function isCommittedDomControlExactBrowserVisualCoverageReady(
  coverage:
    | GpuFlowCommittedSurfaceTextCoverageProof["projectionCoverage"]
    | undefined,
): boolean {
  return coverage === "exact-live-dom" || coverage === "exact-snapshot";
}

function isCommittedDomControlExactBrowserVisualReady(
  coverageState: BrowserVisualActor["coverageState"],
): boolean {
  return (
    coverageState === "live-host-ready" ||
    coverageState === "exact-snapshot-ready"
  );
}

function canUseCommittedDomControlCompatiblePreviousCoverage({
  representationReadiness,
}: {
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): boolean {
  return representationReadiness?.coverageState === "compatible-previous-ready";
}

function isDomControlBrowserVisualCoverageReady(
  browserVisual: BrowserVisualActor,
): boolean {
  return (
    browserVisual.coverageState === "live-host-ready" ||
    browserVisual.coverageState === "exact-snapshot-ready" ||
    browserVisual.coverageState === "compatible-previous-ready"
  );
}

function getDomControlActorReadiness({
  coverageReady,
  coverageRequired,
}: {
  readonly coverageReady: boolean;
  readonly coverageRequired: boolean;
}): GpuFlowCommittedSurfaceActorGeneration["mountReadiness"] {
  if (!coverageRequired) {
    return "not-required";
  }
  return coverageReady ? "ready" : "not-required";
}

function isProjectedDomControl(
  control: GpuRetainedDomControlSourceDescriptor,
): boolean {
  return (
    control.clipRectSurfaceCssPx.width > 0 &&
    control.clipRectSurfaceCssPx.height > 0
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
    control.textCoverageRevision,
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
    control.textCoverageRevision,
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
  browserVisual,
  compatiblePreviousProof,
  control,
  projected,
  semanticGenerationId,
  visualGenerationId,
}: {
  readonly activationPolicy: GpuFlowTextActorActivationPolicy;
  readonly browserVisual: BrowserVisualActor;
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
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
  return createProjectedDomControlTextCoverageProof({
    base,
    browserVisual,
    compatiblePreviousProof,
    control,
  });
}

function createProjectedDomControlTextCoverageProof({
  base,
  browserVisual,
  compatiblePreviousProof,
  control,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "compatiblePreviousProof"
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly browserVisual: BrowserVisualActor;
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  switch (browserVisual.coverageState) {
    case "live-host-ready":
      return {
        ...base,
        projectionCoverage: "exact-live-dom",
      };
    case "exact-snapshot-ready":
      return createExactSnapshotDomControlTextCoverageProof({
        base,
        browserVisual,
        control,
      });
    case "compatible-previous-ready":
      return createCompatiblePreviousDomControlTextCoverageProof({
        base,
        compatiblePreviousProof,
      });
    case "blocked-awaiting-live-host":
      return {
        ...base,
        projectionCoverage: "blocked-awaiting-live-host",
        readinessReason: "live-dom-budget",
      };
    case "blocked-awaiting-snapshot":
    case "coverage-exempt":
      return {
        ...base,
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      };
    case "true-hole":
      return createTrueHoleDomControlTextCoverageProof({ base, control });
  }
}

function createExactSnapshotDomControlTextCoverageProof({
  base,
  browserVisual,
  control,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "compatiblePreviousProof"
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly browserVisual: BrowserVisualActor;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  const snapshotSurfaceId = getReadyDomControlSnapshotSurfaceId({
    browserVisual,
    control,
  });
  if (!snapshotSurfaceId) {
    return {
      ...base,
      projectionCoverage: "true-hole",
      readinessReason: "missing-browser-visual",
    };
  }
  return {
    ...base,
    projectionCoverage: "exact-snapshot",
    snapshotSurfaceId,
  };
}

function createCompatiblePreviousDomControlTextCoverageProof({
  base,
  compatiblePreviousProof,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "compatiblePreviousProof"
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  if (!compatiblePreviousProof) {
    throw new Error(
      "GPU Flow compatible-previous text coverage requires a compatibility proof.",
    );
  }
  return {
    ...base,
    compatiblePreviousProof: createCommittedSurfaceCompatiblePreviousProof(
      compatiblePreviousProof,
    ),
    previousVisualGenerationId:
      compatiblePreviousProof.previousVisualGenerationId,
    projectionCoverage: "compatible-previous",
  };
}

function createCommittedSurfaceCompatiblePreviousProof(
  proof: BrowserVisualActorCompatiblePreviousProof,
): GpuFlowCommittedSurfaceCompatiblePreviousProof {
  return Object.freeze({
    activationPolicy: proof.activationPolicy,
    actorFamily: proof.actorFamily,
    actorId: proof.actorId,
    budgetState: proof.budgetState,
    canonicalActorId: proof.canonicalActorId,
    clipChainRevision: proof.clipChainRevision,
    controlKind: proof.controlKind,
    displayRevision: proof.displayRevision,
    flowRect: Object.freeze({ ...proof.flowRect }),
    focusState: proof.focusState,
    hitMappingCompatible: proof.hitMappingCompatible,
    hitTargetId: proof.hitTargetId,
    maxProofAgeFrames: proof.maxProofAgeFrames,
    maxProofAgeMs: proof.maxProofAgeMs,
    previousActorGenerationId: proof.previousActorGenerationId,
    previousCommittedFrameId: proof.previousCommittedFrameId,
    previousProjectionSampleRevision: proof.previousProjectionSampleRevision,
    previousTransactionId: proof.previousTransactionId,
    previousVisualGenerationId: proof.previousVisualGenerationId,
    proofAgeFrames: proof.proofAgeFrames,
    proofAgeMs: proof.proofAgeMs,
    protectedResourceIds: Object.freeze([...proof.protectedResourceIds]),
    reasonCode: proof.reasonCode,
    requestedActorGenerationId: proof.requestedActorGenerationId,
    requestedProjectionSampleRevision: proof.requestedProjectionSampleRevision,
    requestedVisualGenerationId: proof.requestedVisualGenerationId,
    resourceHandles: Object.freeze(
      proof.resourceHandles.map((handle) => Object.freeze({ ...handle })),
    ),
    retainedScrollCompatible: proof.retainedScrollCompatible,
    retainedSurfaceId: proof.retainedSurfaceId,
    semanticGenerationId: proof.semanticGenerationId,
  });
}

function createTrueHoleDomControlTextCoverageProof({
  base,
  control,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "compatiblePreviousProof"
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  return {
    ...base,
    projectionCoverage: "true-hole",
    readinessReason:
      control.visualPolicy === "clipped-empty"
        ? "clipped-empty"
        : "missing-browser-visual",
  };
}

function getReadyDomControlSnapshotSurfaceId({
  browserVisual,
  control,
}: {
  readonly browserVisual: BrowserVisualActor;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): string | null {
  if (browserVisual.representation?.kind === "passive-snapshot") {
    return browserVisual.representation.snapshotId;
  }
  return control.snapshotSurfaceId;
}

function freezeDomControlActor(
  actor: GpuFlowCommittedSurfaceActorGenerationInput,
): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor(actor);
}
