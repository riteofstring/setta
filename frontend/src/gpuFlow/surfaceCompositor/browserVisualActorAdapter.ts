import { getGpuRetainedDomControlResolvedSnapshotSurfaceId } from "../GpuFlow/retainedDomControlSources";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { GpuRect } from "../viewportMath";
import { createDomControlTextActorRepresentation } from "./browserVisualActorRepresentation";
import {
  createSurfaceActor,
  createSurfaceActorSnapshot,
  type SurfaceActorKind,
  type SurfaceActorSnapshot,
} from "./surfaceActor";
import type {
  ProtectedSurfaceResourceHandle,
  SurfaceCoverageEntry,
  SurfaceResourceHandle,
} from "./surfaceCoverage";
import {
  createSurfaceGeneration,
  type SurfaceActiveDomIslandGeneration,
  type SurfaceGeneration,
  type SurfaceRendererBucket,
} from "./surfaceGeneration";

type BrowserVisualActorKind = "dom-control" | "dom-island";

type BrowserVisualActorVisibilityReason =
  | "blocked"
  | "clipped-empty"
  | "hidden-by-policy"
  | "outside-viewport"
  | "visible";

type BrowserVisualActorNonemptyReason =
  | "active-editor"
  | "native-control-affordance"
  | "placeholder-text"
  | "selection-caret"
  | "semantic-required-visible"
  | "value-text";

type BrowserVisualActorCoverageExemptionReason =
  | "clipped-empty"
  | "hidden-by-policy"
  | "not-browser-owned"
  | "outside-viewport";

type BrowserVisualActorRepresentationKind =
  | "active-editor"
  | "blocked"
  | "compatible-previous"
  | "live-host"
  | "passive-live-display"
  | "passive-snapshot";

export type BrowserVisualActorCoverageState =
  | "blocked-awaiting-live-host"
  | "blocked-awaiting-snapshot"
  | "compatible-previous-ready"
  | "coverage-exempt"
  | "exact-snapshot-ready"
  | "live-host-ready"
  | "true-hole";

export type BrowserVisualActorRepresentationReadiness = {
  readonly coverageState: Exclude<
    BrowserVisualActorCoverageState,
    "compatible-previous-ready"
  >;
  readonly resourceHandles?: readonly SurfaceResourceHandle[] | undefined;
};

type BrowserActorId = string;
type DomIslandId = string;
export type HostId = string;
type SnapshotId = string;
type TransactionId = string;

export type BrowserActorBlockedReason =
  | "clipped-empty"
  | "live-dom-budget"
  | "missing-browser-visual"
  | "snapshot-pending";

export type BrowserTextActorRepresentation =
  | {
      readonly actorId: BrowserActorId;
      readonly hostId: HostId;
      readonly kind: "passive-live-display";
    }
  | {
      readonly actorId: BrowserActorId;
      readonly kind: "passive-snapshot";
      readonly snapshotId: SnapshotId;
    }
  | {
      readonly actorId: BrowserActorId;
      readonly hostId: HostId;
      readonly islandId: DomIslandId;
      readonly kind: "active-editor";
    }
  | {
      readonly actorId: BrowserActorId;
      readonly kind: "compatible-previous";
      readonly previousTransactionId: TransactionId;
    }
  | {
      readonly actorId: BrowserActorId;
      readonly kind: "blocked";
      readonly reason: BrowserActorBlockedReason;
    };

export type BrowserVisualActorCompatiblePreviousProof = {
  readonly previousTransactionId: TransactionId;
  readonly previousVisualGenerationId: string;
  readonly reasonCode: string;
  readonly resourceHandles: readonly SurfaceResourceHandle[];
};

export type BrowserVisualActor = {
  readonly activationClass:
    | "active-browser-editor"
    | "native-dom-island"
    | "retained-activation-model";
  readonly actorId: string;
  readonly actorKind: BrowserVisualActorKind;
  readonly clipChainKey: string;
  readonly clipRect: GpuRect;
  readonly contentGenerationId: string;
  readonly coverageExemption: {
    readonly reason: BrowserVisualActorCoverageExemptionReason;
  } | null;
  readonly coverageRequired: {
    readonly reason:
      | "active-editor"
      | "native-dom-island"
      | "native-control-affordance"
      | "none"
      | "selection-caret"
      | "semantic-required-visible"
      | "value-text";
    readonly required: boolean;
  };
  readonly coverageState: BrowserVisualActorCoverageState;
  readonly flowRect: GpuRect;
  readonly generationId: string;
  readonly hitTargetId: string;
  readonly island: SurfaceActiveDomIslandGeneration | null;
  readonly nonemptyReason: BrowserVisualActorNonemptyReason | null;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly representation: BrowserTextActorRepresentation | null;
  readonly representationKind: BrowserVisualActorRepresentationKind | null;
  readonly resourceHandles: readonly SurfaceResourceHandle[];
  readonly semanticGenerationId: string;
  readonly sourceKey: string;
  readonly sourcePolicy: "layoutsubtree-dom";
  readonly sourceRect: GpuRect;
  readonly surfaceActorKind: SurfaceActorKind;
  readonly surfaceId: string;
  readonly visibilityReason: BrowserVisualActorVisibilityReason;
  readonly visualGenerationId: string;
  readonly zIndex: number;
};

export type BrowserVisualSurfaceTransactionFragment = {
  readonly activeIslands: readonly SurfaceActiveDomIslandGeneration[];
  readonly actorSnapshots: readonly SurfaceActorSnapshot[];
  readonly blockingGenerationIds: readonly string[];
  readonly blockingSurfaceIds: readonly string[];
  readonly compatibleCoverage: readonly SurfaceCoverageEntry[];
  readonly exactCoverage: readonly SurfaceCoverageEntry[];
  readonly protectedResourceHandles: readonly ProtectedSurfaceResourceHandle[];
  readonly rendererBuckets: readonly SurfaceRendererBucket[];
  readonly trueHoleRects: readonly GpuRect[];
  readonly visibleRects: readonly GpuRect[];
  readonly zOrder: readonly string[];
};

type BrowserVisualSurfaceTransactionAccumulator = {
  readonly activeIslands: SurfaceActiveDomIslandGeneration[];
  readonly blockingGenerationIds: string[];
  readonly blockingSurfaceIds: string[];
  readonly compatibleCoverage: SurfaceCoverageEntry[];
  readonly exactCoverage: SurfaceCoverageEntry[];
  readonly protectedResourceHandles: Map<
    string,
    ProtectedSurfaceResourceHandle
  >;
  readonly rendererBuckets: Set<SurfaceRendererBucket>;
  readonly trueHoleRects: GpuRect[];
  readonly visibleRects: GpuRect[];
  readonly zOrder: string[];
};

export function createDomControlBrowserVisualActor(
  control: GpuRetainedDomControlSourceDescriptor,
  options: {
    readonly compatiblePreviousProof?:
      | BrowserVisualActorCompatiblePreviousProof
      | null
      | undefined;
    readonly representationReadiness?:
      | BrowserVisualActorRepresentationReadiness
      | null
      | undefined;
  } = {},
): BrowserVisualActor {
  const compatiblePreviousProof = options.compatiblePreviousProof ?? null;
  const representationReadiness = options.representationReadiness ?? null;
  const visibilityReason = getDomControlVisibilityReason(control);
  const nonemptyReason = getDomControlNonemptyReason(control);
  const coverageRequired = getDomControlCoverageRequired({
    control,
    nonemptyReason,
    representationReadiness,
    visibilityReason,
  });
  const coverageExemption = coverageRequired.required
    ? null
    : getDomControlCoverageExemption(visibilityReason);
  const coverageState = getDomControlCoverageState({
    compatiblePreviousProof,
    control,
    coverageRequired: coverageRequired.required,
    representationReadiness,
  });
  const representationKind = getDomControlRepresentationKind({
    control,
    coverageState,
  });
  const representation = createDomControlTextActorRepresentation({
    compatiblePreviousProof,
    control,
    coverageState,
  });
  const resourceHandles = getBrowserVisualActorResourceHandles({
    compatiblePreviousProof,
    control,
    coverageState,
    representationReadiness,
  });
  const contentGenerationId = [
    "browser-dom-control-content",
    control.sourceId,
    control.sourceKey,
    control.valueStyleRevision,
    control.textCoverageRevision,
  ].join("|");
  const semanticGenerationId = [
    "browser-dom-control-semantic",
    control.sourceId,
    control.value,
    control.defaultValue,
    control.disabled,
    control.error,
    control.textCoverageRevision,
  ].join("|");
  const visualGenerationId = [
    "browser-dom-control-visual",
    control.sourceId,
    control.visualPolicy,
    control.snapshotSurfaceId ?? "surface:none",
    control.snapshotCacheKeyRevision,
    control.textCoverageRevision,
  ].join("|");
  const generationId = [
    contentGenerationId,
    semanticGenerationId,
    visualGenerationId,
    control.geometryRevision,
    control.clipChainRevision,
    coverageState,
  ].join("|");
  return freezeBrowserVisualActor({
    activationClass: control.active
      ? "active-browser-editor"
      : "retained-activation-model",
    actorId: control.sourceId,
    actorKind: "dom-control",
    clipChainKey: control.clipChainRevision,
    clipRect: control.clipRectSurfaceCssPx,
    contentGenerationId,
    coverageExemption,
    coverageRequired,
    coverageState,
    flowRect: control.worldRectFlowPx,
    generationId,
    hitTargetId: control.controlId,
    island: null,
    nonemptyReason,
    rendererBucket: "native-control",
    representation,
    representationKind,
    resourceHandles,
    semanticGenerationId,
    sourceKey: control.sourceKey,
    sourcePolicy: "layoutsubtree-dom",
    sourceRect: control.sourceRectCssPx,
    surfaceActorKind: "dom-control",
    surfaceId: `dom-control:${control.sourceId}`,
    visibilityReason,
    visualGenerationId,
    zIndex: control.zOrder,
  });
}

export function createDomIslandBrowserVisualActor(
  island: GpuDomIsland,
  options: {
    readonly representationReadiness?:
      | BrowserVisualActorRepresentationReadiness
      | null
      | undefined;
  } = {},
): BrowserVisualActor {
  const visible = island.rect.width > 0 && island.rect.height > 0;
  const surfaceId = `active-dom-island:${island.id}`;
  const coverage = createDomIslandBrowserVisualCoverage({
    island,
    representationReadiness: options.representationReadiness ?? null,
    visible,
  });
  const contentGenerationId = [
    "browser-dom-island-content",
    island.id,
    island.kind,
    island.source.kind === "retained-content"
      ? island.source.ownerRowId
      : "custom",
  ].join("|");
  const semanticGenerationId = [
    "browser-dom-island-semantic",
    island.id,
    island.kind,
  ].join("|");
  const visualGenerationId = [
    "browser-dom-island-visual",
    island.id,
    island.clipOwnerId,
    rectKey(island.rect),
    rectKey(island.contentRect),
  ].join("|");
  const generationId = [
    contentGenerationId,
    semanticGenerationId,
    visualGenerationId,
    coverage.coverageState,
  ].join("|");
  const activeIsland = Object.freeze({
    focusIdentity: island.id,
    generationId,
    islandId: island.id,
    ownerSurfaceId: surfaceId,
    rect: freezeRect(island.rect),
  });
  return freezeBrowserVisualActor({
    activationClass: "native-dom-island",
    actorId: island.id,
    actorKind: "dom-island",
    clipChainKey: island.clipOwnerId,
    clipRect: island.rect,
    contentGenerationId,
    coverageExemption: coverage.coverageExemption,
    coverageRequired: coverage.coverageRequired,
    coverageState: coverage.coverageState,
    flowRect: island.rect,
    generationId,
    hitTargetId: island.id,
    island: coverage.coverageState === "live-host-ready" ? activeIsland : null,
    nonemptyReason: coverage.nonemptyReason,
    rendererBucket: "native-control",
    representation: null,
    representationKind: coverage.representationKind,
    resourceHandles: coverage.resourceHandles,
    semanticGenerationId,
    sourceKey: island.id,
    sourcePolicy: "layoutsubtree-dom",
    sourceRect: island.contentRect,
    surfaceActorKind: "active-dom-island",
    surfaceId,
    visibilityReason: coverage.visibilityReason,
    visualGenerationId,
    zIndex: island.zIndex,
  });
}

function createDomIslandBrowserVisualCoverage({
  island,
  representationReadiness,
  visible,
}: {
  readonly island: GpuDomIsland;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly visible: boolean;
}): Pick<
  BrowserVisualActor,
  | "coverageExemption"
  | "coverageRequired"
  | "coverageState"
  | "nonemptyReason"
  | "representation"
  | "representationKind"
  | "resourceHandles"
  | "visibilityReason"
> {
  if (!visible) {
    return Object.freeze({
      coverageExemption: Object.freeze({ reason: "clipped-empty" as const }),
      coverageRequired: Object.freeze({
        reason: "none" as const,
        required: false,
      }),
      coverageState: "coverage-exempt",
      nonemptyReason: null,
      representation: null,
      representationKind: null,
      resourceHandles: Object.freeze([]),
      visibilityReason: "clipped-empty",
    });
  }
  const coverageState =
    representationReadiness?.coverageState === "live-host-ready"
      ? "live-host-ready"
      : "blocked-awaiting-live-host";
  const resourceHandles =
    coverageState === "live-host-ready"
      ? createBrowserVisualReadinessResourceHandles({
          fallback: Object.freeze([
            Object.freeze({
              id: island.id,
              kind: "native-dom-island" as const,
            }),
          ]),
          representationReadiness,
        })
      : Object.freeze([]);
  return Object.freeze({
    coverageExemption: null,
    coverageRequired: Object.freeze({
      reason: "native-dom-island" as const,
      required: true,
    }),
    coverageState,
    nonemptyReason: "semantic-required-visible",
    representation: null,
    representationKind:
      coverageState === "live-host-ready" ? "live-host" : "blocked",
    resourceHandles,
    visibilityReason: "visible",
  });
}

export function createBrowserVisualSurfaceTransactionFragment(
  actors: readonly BrowserVisualActor[],
): BrowserVisualSurfaceTransactionFragment {
  const actorSnapshots = actors.map(createBrowserVisualActorSnapshot);
  const accumulator = createBrowserVisualSurfaceTransactionAccumulator();

  for (const actor of actors) {
    accumulator.rendererBuckets.add(actor.rendererBucket);
    if (actor.island) {
      accumulator.activeIslands.push(actor.island);
    }
    applyBrowserVisualActorTransactionCoverage({
      accumulator,
      actor,
    });
  }

  return Object.freeze({
    activeIslands: Object.freeze(accumulator.activeIslands),
    actorSnapshots: Object.freeze(actorSnapshots),
    blockingGenerationIds: Object.freeze(accumulator.blockingGenerationIds),
    blockingSurfaceIds: Object.freeze(accumulator.blockingSurfaceIds),
    compatibleCoverage: Object.freeze(accumulator.compatibleCoverage),
    exactCoverage: Object.freeze(accumulator.exactCoverage),
    protectedResourceHandles: Object.freeze([
      ...accumulator.protectedResourceHandles.values(),
    ]),
    rendererBuckets: Object.freeze([...accumulator.rendererBuckets]),
    trueHoleRects: Object.freeze(accumulator.trueHoleRects.map(freezeRect)),
    visibleRects: Object.freeze(accumulator.visibleRects.map(freezeRect)),
    zOrder: Object.freeze(accumulator.zOrder),
  });
}

function createBrowserVisualSurfaceTransactionAccumulator(): BrowserVisualSurfaceTransactionAccumulator {
  return {
    activeIslands: [],
    blockingGenerationIds: [],
    blockingSurfaceIds: [],
    compatibleCoverage: [],
    exactCoverage: [],
    protectedResourceHandles: new Map(),
    rendererBuckets: new Set(),
    trueHoleRects: [],
    visibleRects: [],
    zOrder: [],
  };
}

function applyBrowserVisualActorTransactionCoverage({
  accumulator,
  actor,
}: {
  readonly accumulator: BrowserVisualSurfaceTransactionAccumulator;
  readonly actor: BrowserVisualActor;
}) {
  if (!actor.coverageRequired.required) {
    return;
  }
  accumulator.visibleRects.push(actor.flowRect);
  accumulator.zOrder.push(actor.surfaceId);
  if (actor.coverageState === "coverage-exempt") {
    return;
  }
  const generation = createBrowserVisualSurfaceGeneration(actor);
  const coverageEntry = createBrowserVisualCoverageEntry({
    actor,
    generation,
  });
  applyBrowserVisualCoverageEntry({
    accumulator,
    actor,
    coverageEntry,
  });
}

function applyBrowserVisualCoverageEntry({
  accumulator,
  actor,
  coverageEntry,
}: {
  readonly accumulator: BrowserVisualSurfaceTransactionAccumulator;
  readonly actor: BrowserVisualActor;
  readonly coverageEntry: SurfaceCoverageEntry;
}) {
  switch (actor.coverageState) {
    case "live-host-ready":
    case "exact-snapshot-ready":
      accumulator.exactCoverage.push(coverageEntry);
      protectBrowserVisualActorResources({
        actor,
        protectedResourceHandles: accumulator.protectedResourceHandles,
      });
      break;
    case "compatible-previous-ready":
      accumulator.compatibleCoverage.push({
        ...coverageEntry,
        fidelity: "compatible",
      });
      protectBrowserVisualActorResources({
        actor,
        protectedResourceHandles: accumulator.protectedResourceHandles,
      });
      break;
    case "blocked-awaiting-live-host":
    case "blocked-awaiting-snapshot":
    case "true-hole":
      accumulator.trueHoleRects.push(actor.flowRect);
      accumulator.blockingSurfaceIds.push(actor.surfaceId);
      accumulator.blockingGenerationIds.push(actor.generationId);
      break;
    case "coverage-exempt":
      break;
  }
}

function createBrowserVisualActorSnapshot(
  actor: BrowserVisualActor,
): SurfaceActorSnapshot {
  const generation = createBrowserVisualSurfaceGeneration(actor);
  return createSurfaceActorSnapshot({
    actor: createSurfaceActor({
      currentGenerationId: generation.generationId,
      kind: actor.surfaceActorKind,
      rendererBucket: actor.rendererBucket,
      sourceKey: generation.sourceKey,
      sourcePolicy: actor.sourcePolicy,
      surfaceId: actor.surfaceId,
    }),
    generation,
  });
}

function createBrowserVisualSurfaceGeneration(
  actor: BrowserVisualActor,
): SurfaceGeneration {
  const ready =
    actor.coverageState === "live-host-ready" ||
    actor.coverageState === "exact-snapshot-ready" ||
    actor.coverageState === "compatible-previous-ready" ||
    actor.coverageState === "coverage-exempt";
  return createSurfaceGeneration({
    activeDomIsland: actor.island,
    clipRect: actor.clipRect,
    contentVersion: actor.contentGenerationId,
    fidelity:
      actor.coverageState === "compatible-previous-ready"
        ? "compatible-previous-generation"
        : "exact",
    flowRect: actor.flowRect,
    generationId: actor.generationId,
    hitIndex: {
      entries: Object.freeze([
        Object.freeze({
          id: actor.hitTargetId,
          rect: actor.flowRect,
          role: actor.actorKind,
        }),
      ]),
      generationId: actor.generationId,
    },
    paintReadiness: ready ? "ready" : "pending",
    rendererBucket: actor.rendererBucket,
    sourceKey: actor.sourceKey,
    sourceWindow: {
      contentToTextureKey: [
        actor.visualGenerationId,
        actor.semanticGenerationId,
        rectKey(actor.sourceRect),
      ].join("|"),
      sourceRect: actor.sourceRect,
    },
    surfaceId: actor.surfaceId,
    textureReadiness: ready ? "ready" : "pending",
    visualVersion: actor.visualGenerationId,
    zIndex: actor.zIndex,
  });
}

function createBrowserVisualCoverageEntry({
  actor,
  generation,
}: {
  readonly actor: BrowserVisualActor;
  readonly generation: SurfaceGeneration;
}): SurfaceCoverageEntry {
  return Object.freeze({
    coverageRect: freezeRect(actor.flowRect),
    fidelity:
      actor.coverageState === "compatible-previous-ready"
        ? "compatible"
        : "exact",
    generationId: generation.generationId,
    rendererBucket: generation.rendererBucket,
    resourceHandles: actor.resourceHandles,
    surfaceId: generation.surfaceId,
    zIndex: generation.zIndex,
  });
}

function protectBrowserVisualActorResources({
  actor,
  protectedResourceHandles,
}: {
  readonly actor: BrowserVisualActor;
  readonly protectedResourceHandles: Map<
    string,
    ProtectedSurfaceResourceHandle
  >;
}): void {
  for (const handle of actor.resourceHandles) {
    protectedResourceHandles.set(`${handle.kind}:${handle.id}`, {
      ...handle,
      reason:
        handle.kind === "native-dom-island"
          ? "active-dom-island"
          : handle.kind === "source"
            ? "interactive-source"
            : "published-transaction",
    });
  }
}

function getDomControlVisibilityReason(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorVisibilityReason {
  if (control.visualPolicy === "blocked-awaiting-browser-visual") {
    return "blocked";
  }
  switch (control.projectionVisibility) {
    case "viewport-visible":
      return "visible";
    case "overscan-visible":
    case "outside-viewport":
      return "outside-viewport";
    case "clipped-empty":
      return "clipped-empty";
  }
}

function getDomControlNonemptyReason(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorNonemptyReason {
  if (control.value.length > 0) {
    return "value-text";
  }
  if (hasDomControlSelectionCaretCoverage(control)) {
    return "selection-caret";
  }
  if (control.active) {
    return "active-editor";
  }
  if (control.snapshotCacheKey.placeholder.length > 0) {
    return "placeholder-text";
  }
  return "native-control-affordance";
}

function getDomControlCoverageRequired({
  control,
  nonemptyReason,
  representationReadiness,
  visibilityReason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly nonemptyReason: BrowserVisualActorNonemptyReason;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly visibilityReason: BrowserVisualActorVisibilityReason;
}): BrowserVisualActor["coverageRequired"] {
  if (representationReadiness?.coverageState === "coverage-exempt") {
    return { reason: "none", required: false };
  }
  const required =
    control.active ||
    visibilityReason === "visible" ||
    visibilityReason === "blocked";
  if (!required) {
    return { reason: "none", required: false };
  }
  if (nonemptyReason === "value-text") {
    return { reason: "value-text", required: true };
  }
  if (nonemptyReason === "active-editor") {
    return { reason: "active-editor", required: true };
  }
  if (nonemptyReason === "selection-caret") {
    return { reason: "selection-caret", required: true };
  }
  return { reason: "native-control-affordance", required: true };
}

function hasDomControlSelectionCaretCoverage(
  control: GpuRetainedDomControlSourceDescriptor,
): boolean {
  return (
    control.textCoverageState.caret === "visible" ||
    control.textCoverageState.composition === "active" ||
    control.textCoverageState.selection !== "none"
  );
}

function getDomControlCoverageExemption(
  visibilityReason: BrowserVisualActorVisibilityReason,
): BrowserVisualActor["coverageExemption"] {
  switch (visibilityReason) {
    case "clipped-empty":
      return { reason: "clipped-empty" };
    case "outside-viewport":
      return { reason: "outside-viewport" };
    case "hidden-by-policy":
      return { reason: "hidden-by-policy" };
    case "blocked":
    case "visible":
      return null;
  }
}

function getDomControlCoverageState({
  compatiblePreviousProof,
  control,
  coverageRequired,
  representationReadiness,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageRequired: boolean;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): BrowserVisualActorCoverageState {
  if (!coverageRequired) {
    return "coverage-exempt";
  }
  if (
    compatiblePreviousProof &&
    canUseDomControlCompatiblePreviousCoverage({
      control,
      representationReadiness,
    })
  ) {
    return "compatible-previous-ready";
  }
  return getDomControlCoverageStateForVisualPolicy({
    control,
    representationReadiness,
  });
}

function getDomControlCoverageStateForVisualPolicy({
  control,
  representationReadiness,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): BrowserVisualActorCoverageState {
  const readinessState = representationReadiness?.coverageState;
  switch (control.visualPolicy) {
    case "live-dom":
      return getLiveDomControlCoverageState(readinessState);
    case "snapshot":
      return getSnapshotDomControlCoverageState(readinessState);
    case "blocked-awaiting-browser-visual":
      return getBlockedDomControlCoverageState(readinessState);
    case "outside-viewport":
      return "coverage-exempt";
    case "clipped-empty":
      return "true-hole";
  }
}

function getLiveDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  if (readinessState === "exact-snapshot-ready") {
    return "exact-snapshot-ready";
  }
  return readinessState === "live-host-ready"
    ? "live-host-ready"
    : "blocked-awaiting-live-host";
}

function getSnapshotDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  return readinessState === "exact-snapshot-ready"
    ? "exact-snapshot-ready"
    : "blocked-awaiting-snapshot";
}

function getBlockedDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  if (readinessState === "live-host-ready") {
    return "live-host-ready";
  }
  if (readinessState === "exact-snapshot-ready") {
    return "exact-snapshot-ready";
  }
  return "blocked-awaiting-snapshot";
}

function canUseDomControlCompatiblePreviousCoverage({
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

function getDomControlRepresentationKind({
  control,
  coverageState,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserVisualActorRepresentationKind | null {
  if (coverageState === "coverage-exempt") {
    return null;
  }
  if (coverageState === "compatible-previous-ready") {
    return "compatible-previous";
  }
  if (
    coverageState === "blocked-awaiting-live-host" ||
    coverageState === "blocked-awaiting-snapshot" ||
    coverageState === "true-hole"
  ) {
    return "blocked";
  }
  if (control.active) {
    return "active-editor";
  }
  if (coverageState === "exact-snapshot-ready") {
    return "passive-snapshot";
  }
  return "passive-live-display";
}

function getBrowserVisualActorResourceHandles({
  compatiblePreviousProof,
  control,
  coverageState,
  representationReadiness,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): readonly SurfaceResourceHandle[] {
  if (coverageState === "live-host-ready") {
    return createBrowserVisualReadinessResourceHandles({
      fallback: Object.freeze([{ id: control.sourceId, kind: "source" }]),
      representationReadiness,
    });
  }
  if (coverageState === "exact-snapshot-ready") {
    return createBrowserVisualReadinessResourceHandles({
      fallback: createDomControlSnapshotResourceHandles(control),
      representationReadiness,
    });
  }
  if (coverageState === "compatible-previous-ready") {
    return Object.freeze(
      compatiblePreviousProof?.resourceHandles.map((handle) =>
        Object.freeze({ ...handle }),
      ) ?? [],
    );
  }
  return Object.freeze([]);
}

function createBrowserVisualReadinessResourceHandles({
  fallback,
  representationReadiness,
}: {
  readonly fallback: readonly SurfaceResourceHandle[];
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): readonly SurfaceResourceHandle[] {
  const resourceHandles = representationReadiness?.resourceHandles ?? fallback;
  return Object.freeze(
    resourceHandles.map((handle) => Object.freeze({ ...handle })),
  );
}

function createDomControlSnapshotResourceHandles(
  control: GpuRetainedDomControlSourceDescriptor,
): readonly SurfaceResourceHandle[] {
  return Object.freeze([
    {
      id: getGpuRetainedDomControlResolvedSnapshotSurfaceId(control),
      kind: "texture",
    },
  ]);
}

function freezeBrowserVisualActor(
  actor: BrowserVisualActor,
): BrowserVisualActor {
  return Object.freeze({
    ...actor,
    clipRect: freezeRect(actor.clipRect),
    coverageExemption: actor.coverageExemption
      ? Object.freeze({ ...actor.coverageExemption })
      : null,
    coverageRequired: Object.freeze({ ...actor.coverageRequired }),
    flowRect: freezeRect(actor.flowRect),
    island: actor.island
      ? Object.freeze({
          ...actor.island,
          rect: freezeRect(actor.island.rect),
        })
      : null,
    resourceHandles: Object.freeze(
      actor.resourceHandles.map((handle) => Object.freeze({ ...handle })),
    ),
    sourceRect: freezeRect(actor.sourceRect),
  });
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

function rectKey(rect: GpuRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}
