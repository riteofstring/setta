import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { GpuRect } from "../viewportMath";
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

export type BrowserVisualActorKind = "dom-control" | "dom-island";

export type BrowserVisualActorVisibilityReason =
  | "blocked"
  | "clipped-empty"
  | "hidden-by-policy"
  | "outside-viewport"
  | "visible";

export type BrowserVisualActorNonemptyReason =
  | "active-editor"
  | "native-control-affordance"
  | "placeholder-text"
  | "selection-caret"
  | "semantic-required-visible"
  | "value-text";

export type BrowserVisualActorCoverageExemptionReason =
  | "clipped-empty"
  | "hidden-by-policy"
  | "not-browser-owned"
  | "outside-viewport";

export type BrowserVisualActorRepresentationKind =
  | "active-editor"
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
): BrowserVisualActor {
  const visibilityReason = getDomControlVisibilityReason(control);
  const nonemptyReason = getDomControlNonemptyReason(control);
  const coverageRequired = getDomControlCoverageRequired({
    control,
    nonemptyReason,
    visibilityReason,
  });
  const coverageExemption = coverageRequired.required
    ? null
    : getDomControlCoverageExemption(visibilityReason);
  const coverageState = getDomControlCoverageState({
    control,
    coverageRequired: coverageRequired.required,
  });
  const representationKind = getDomControlRepresentationKind({
    control,
    coverageState,
  });
  const resourceHandles = getBrowserVisualActorResourceHandles({
    control,
    coverageState,
  });
  const contentGenerationId = [
    "browser-dom-control-content",
    control.sourceId,
    control.sourceKey,
    control.valueStyleRevision,
  ].join("|");
  const semanticGenerationId = [
    "browser-dom-control-semantic",
    control.sourceId,
    control.value,
    control.defaultValue,
    control.disabled,
    control.error,
  ].join("|");
  const visualGenerationId = [
    "browser-dom-control-visual",
    control.sourceId,
    control.visualPolicy,
    control.snapshotSurfaceId ?? "surface:none",
    control.snapshotCacheKeyRevision,
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
): BrowserVisualActor {
  const visible = island.rect.width > 0 && island.rect.height > 0;
  const surfaceId = `active-dom-island:${island.id}`;
  const coverage = createDomIslandBrowserVisualCoverage({
    island,
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
    visible ? "live-host-ready" : "true-hole",
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
    island: activeIsland,
    nonemptyReason: coverage.nonemptyReason,
    rendererBucket: "native-control",
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
  visible,
}: {
  readonly island: GpuDomIsland;
  readonly visible: boolean;
}): Pick<
  BrowserVisualActor,
  | "coverageExemption"
  | "coverageRequired"
  | "coverageState"
  | "nonemptyReason"
  | "representationKind"
  | "resourceHandles"
  | "visibilityReason"
> {
  if (!visible) {
    return Object.freeze({
      coverageExemption: { reason: "clipped-empty" },
      coverageRequired: { reason: "none", required: false },
      coverageState: "coverage-exempt",
      nonemptyReason: null,
      representationKind: null,
      resourceHandles: Object.freeze([]),
      visibilityReason: "clipped-empty",
    });
  }
  return Object.freeze({
    coverageExemption: null,
    coverageRequired: { reason: "native-dom-island", required: true },
    coverageState: "live-host-ready",
    nonemptyReason: "semantic-required-visible",
    representationKind: "live-host",
    resourceHandles: Object.freeze([
      { id: island.id, kind: "native-dom-island" },
    ]),
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

export function createBrowserVisualActorSnapshot(
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
    case "overscan-visible":
      return "visible";
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
  visibilityReason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly nonemptyReason: BrowserVisualActorNonemptyReason;
  readonly visibilityReason: BrowserVisualActorVisibilityReason;
}): BrowserVisualActor["coverageRequired"] {
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
  return { reason: "native-control-affordance", required: true };
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
  control,
  coverageRequired,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageRequired: boolean;
}): BrowserVisualActorCoverageState {
  if (!coverageRequired) {
    return "coverage-exempt";
  }
  switch (control.visualPolicy) {
    case "live-dom":
      return "live-host-ready";
    case "snapshot":
      return control.snapshotSurfaceId
        ? "exact-snapshot-ready"
        : "blocked-awaiting-snapshot";
    case "blocked-awaiting-browser-visual":
      return "blocked-awaiting-snapshot";
    case "outside-viewport":
      return "coverage-exempt";
    case "clipped-empty":
      return "true-hole";
  }
}

function getDomControlRepresentationKind({
  control,
  coverageState,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
}): BrowserVisualActorRepresentationKind | null {
  if (coverageState === "coverage-exempt" || coverageState === "true-hole") {
    return null;
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
  control,
  coverageState,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState: BrowserVisualActorCoverageState;
}): readonly SurfaceResourceHandle[] {
  switch (coverageState) {
    case "live-host-ready":
      return Object.freeze([{ id: control.sourceId, kind: "source" }]);
    case "exact-snapshot-ready":
      return Object.freeze([
        {
          id: [
            control.snapshotSurfaceId,
            control.snapshotCacheKeyRevision,
          ].join(":"),
          kind: "texture",
        },
      ]);
    case "blocked-awaiting-live-host":
    case "blocked-awaiting-snapshot":
    case "compatible-previous-ready":
    case "coverage-exempt":
    case "true-hole":
      return Object.freeze([]);
  }
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
