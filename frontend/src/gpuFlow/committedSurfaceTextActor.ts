import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceTextCoverageProof,
  GpuFlowTextActorActivationPolicy,
} from "./committedSurfaceFrame";
import { createGpuFlowDomControlCompatiblePreviousProof } from "./GpuFlow/domControlPlaneCompatibility";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import {
  createDomControlBrowserVisualActor,
  type BrowserVisualActor,
  type BrowserVisualActorCompatiblePreviousProof,
  type BrowserVisualActorRepresentationReadiness,
} from "./surfaceCompositor/browserVisualActorAdapter";
import type { GpuRect } from "./viewportMath";

export type DomControlActorOptions = {
  readonly previousCommittedSurfaceActors?:
    | readonly GpuFlowCommittedSurfaceActorGeneration[]
    | null;
  readonly previousRetainedRuntimeFrame?: GpuRetainedRuntimeFrame | null;
  readonly previousTransactionId?: string | null;
  readonly browserVisualReadinessByActorId?: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  > | null;
};

export type DomControlActorSet = {
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
        compatiblePreviousProof: createDomControlCompatiblePreviousCoverage({
          control,
          representationReadiness,
          previousActor: previousActorById.get(control.sourceId),
          previousControl: previousControlById.get(control.sourceId),
          previousTransactionId: options.previousTransactionId ?? null,
        }),
        control,
        representationReadiness,
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
  compatiblePreviousProof,
  control,
  representationReadiness,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
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
      generationId: [
        contentGenerationId,
        layoutProjectionGenerationId,
        readinessGenerationId,
      ].join("|"),
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
  previousControl,
  previousTransactionId,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly previousActor: GpuFlowCommittedSurfaceActorGeneration | undefined;
  readonly previousControl: GpuRetainedDomControlSourceDescriptor | undefined;
  readonly previousTransactionId: string | null;
}): BrowserVisualActorCompatiblePreviousProof | null {
  if (
    !previousControl ||
    !isCommittedDomControlCompatiblePreviousSourceReady(previousActor) ||
    !previousTransactionId ||
    !canUseCommittedDomControlCompatiblePreviousCoverage({
      control,
      representationReadiness,
    })
  ) {
    return null;
  }
  const proof = createGpuFlowDomControlCompatiblePreviousProof({
    current: control,
    previous: previousControl,
  });
  if (!proof) {
    return null;
  }
  return Object.freeze({
    previousTransactionId,
    previousVisualGenerationId:
      createDomControlVisualGenerationId(previousControl),
    reasonCode: proof.reasonCode,
    resourceHandles: Object.freeze(
      previousActor.browserVisual.resourceHandles.map((handle) =>
        Object.freeze({ ...handle }),
      ),
    ),
  });
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
  control,
  representationReadiness,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): boolean {
  return (
    control.visualPolicy === "blocked-awaiting-browser-visual" ||
    (control.visualPolicy === "snapshot" && !control.snapshotSurfaceId) ||
    representationReadiness?.coverageState === "blocked-awaiting-live-host" ||
    representationReadiness?.coverageState === "blocked-awaiting-snapshot"
  );
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
        browserVisual,
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
  browserVisual,
  compatiblePreviousProof,
}: {
  readonly base: Omit<
    GpuFlowCommittedSurfaceTextCoverageProof,
    | "previousVisualGenerationId"
    | "projectionCoverage"
    | "readinessReason"
    | "snapshotSurfaceId"
  >;
  readonly browserVisual: BrowserVisualActor;
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
}): GpuFlowCommittedSurfaceTextCoverageProof {
  return {
    ...base,
    previousVisualGenerationId:
      compatiblePreviousProof?.previousVisualGenerationId ??
      browserVisual.visualGenerationId,
    projectionCoverage: "compatible-previous",
  };
}

function createTrueHoleDomControlTextCoverageProof({
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
