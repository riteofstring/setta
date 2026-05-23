import { freezeActor } from "./committedSurfaceActorFreeze";
import type {
  GpuFlowCommittedSurfaceActorGenerationClassification,
  GpuFlowCommittedSurfaceCanonicalActorId,
} from "./committedSurfaceActorIdentity";
import {
  createGpuFlowCommittedSurfaceBrowserVisualFragment,
  createGpuFlowCommittedSurfaceTransaction,
} from "./committedSurfaceBrowserVisualFragment";
import { createGpuFlowCommittedSurfaceCompleteness } from "./committedSurfaceCompleteness";
import {
  createGpuFlowContentFramePublishability,
  createGpuFlowProjectionHorizon,
  isGpuFlowCommittedTextActor,
} from "./committedSurfaceFrameProjection";
import {
  createGpuNativeVisualActors,
  getGpuFlowCommittedSurfaceActorScrollRevision,
  rectKey,
} from "./committedSurfaceGpuNativeVisualActor";
import {
  assertGpuFlowCommittedSurfaceFrameCoherent,
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceCoherence,
  type GpuFlowCommittedSurfacePresentationProof,
} from "./committedSurfacePresentationProof";
import {
  createDomControlActorSet,
  type DomControlActorOptions,
} from "./committedSurfaceTextActor";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuDomIsland } from "./scene";
import {
  createDomIslandBrowserVisualActor,
  type BrowserVisualActor,
  type BrowserVisualActorRepresentationReadiness,
  type BrowserVisualSurfaceTransactionFragment,
} from "./surfaceCompositor/browserVisualActorAdapter";
import type { SurfaceActorSnapshot } from "./surfaceCompositor/surfaceActor";
import type { SurfaceResourceHandle } from "./surfaceCompositor/surfaceCoverage";
import type { SurfaceDisplayTransaction } from "./surfaceCompositor/surfaceTransaction";
import type { GpuRect, GpuViewportInput } from "./viewportMath";

export {
  assertGpuFlowCommittedSurfaceFrameCoherent,
  assertGpuFlowCommittedSurfacePresentationProof,
  createGpuFlowCommittedSurfaceActorManifestDigest,
  createGpuFlowCommittedSurfacePresentationProof,
} from "./committedSurfacePresentationProof";
export type {
  GpuFlowCommittedSurfaceCoherence,
  GpuFlowCommittedSurfacePresentationProof,
} from "./committedSurfacePresentationProof";

type GpuFlowCommittedSurfaceActorKind =
  | "retained-page"
  | "dom-control"
  | "dom-island"
  | "html-texture"
  | "gpu-native-visual";

export type GpuFlowTextActorActivationPolicy =
  | "allowed"
  | "requires-current-visual"
  | "queue-until-ready";

type GpuFlowCommittedSurfaceTextCoverageProofBase = {
  readonly accessibilityProjection: "browser-dom";
  readonly activationPolicy: GpuFlowTextActorActivationPolicy;
  readonly focusable: boolean;
  readonly pointerSemantics:
    | "active-browser-editor"
    | "retained-activation-model";
  readonly rendererFamily: string;
  readonly rendererSource: "browser-dom";
  readonly role: "text-like";
  readonly selectable: "browser-editor" | "none";
  readonly semanticGenerationId: string;
  readonly snapshotCacheKeyRevision: string;
  readonly visualGenerationId: string;
};

export type GpuFlowCommittedSurfaceCompatiblePreviousProof = {
  readonly activationPolicy: string;
  readonly actorFamily: string;
  readonly actorId: string;
  readonly budgetState: "over-budget" | "within-budget";
  readonly canonicalActorId: GpuFlowCommittedSurfaceCanonicalActorId;
  readonly clipChainRevision: string;
  readonly controlKind: string;
  readonly displayRevision: string | null;
  readonly flowRect: GpuRect;
  readonly focusState: "active" | "composing" | "focused" | "inactive";
  readonly hitMappingCompatible: boolean;
  readonly hitTargetId: string;
  readonly maxProofAgeFrames: number;
  readonly maxProofAgeMs: number | null;
  readonly previousActorGenerationId: string;
  readonly previousCommittedFrameId: number;
  readonly previousProjectionSampleRevision: string;
  readonly previousTransactionId: string;
  readonly previousVisualGenerationId: string;
  readonly proofAgeFrames: number;
  readonly proofAgeMs: number | null;
  readonly protectedResourceIds: readonly string[];
  readonly reasonCode: string;
  readonly requestedActorGenerationId: string;
  readonly requestedProjectionSampleRevision: string;
  readonly requestedVisualGenerationId: string;
  readonly resourceHandles: readonly SurfaceResourceHandle[];
  readonly retainedScrollCompatible: boolean;
  readonly retainedSurfaceId: string;
  readonly semanticGenerationId: string;
};

export type GpuFlowCommittedSurfaceTextCoverageProof =
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "exact-live-dom";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "exact-snapshot";
      readonly snapshotSurfaceId: string;
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly compatiblePreviousProof: GpuFlowCommittedSurfaceCompatiblePreviousProof;
      readonly previousVisualGenerationId: string;
      readonly projectionCoverage: "compatible-previous";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "blocked-awaiting-browser-visual";
      readonly readinessReason: "snapshot-pending" | "live-dom-budget";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "blocked-awaiting-live-host";
      readonly readinessReason: "live-dom-budget";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "true-hole";
      readonly readinessReason: "clipped-empty" | "missing-browser-visual";
    });

export type GpuFlowCommittedSurfaceBrowserVisualContract = Pick<
  BrowserVisualActor,
  | "coverageExemption"
  | "coverageRequired"
  | "coverageState"
  | "nonemptyReason"
  | "proof"
  | "representation"
  | "representationKind"
  | "resourceHandles"
  | "visibilityReason"
>;

export type GpuFlowCommittedSurfaceActorGeneration = {
  readonly active: boolean;
  readonly accessibilityProjection: "browser-dom" | "none";
  readonly activationPolicy: GpuFlowTextActorActivationPolicy | "none";
  readonly actorId: string;
  readonly actorFamily:
    | GpuFlowCommittedSurfaceActorKind
    | "text-like-dom-control";
  readonly browserVisual: GpuFlowCommittedSurfaceBrowserVisualContract | null;
  readonly canonicalActorId: GpuFlowCommittedSurfaceCanonicalActorId;
  readonly clipChainRevision: string;
  readonly clipRect: GpuRect;
  readonly contentGenerationId: string;
  readonly controlId: string | null;
  readonly focusIdentity: string | null;
  readonly flowRect: GpuRect;
  readonly generationId: string;
  readonly generationClassification: GpuFlowCommittedSurfaceActorGenerationClassification;
  readonly islandId: string | null;
  readonly kind: GpuFlowCommittedSurfaceActorKind;
  readonly layoutProjectionGenerationId: string;
  readonly liveMotionSampleId: string;
  readonly mountReadiness: "not-required" | "ready";
  readonly ownerSurfaceId: string;
  readonly pointerEvents: "auto" | "none";
  readonly projectionReadiness: "not-required" | "ready";
  readonly readinessGenerationId: string;
  readonly retainedScrollOffset: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly retainedScrollRevision: number;
  readonly rowId: string | null;
  readonly semanticGenerationId: string;
  readonly sourceRect: GpuRect;
  readonly textCoverageProof: GpuFlowCommittedSurfaceTextCoverageProof | null;
  readonly textSnapshotCacheKeyRevision: string | null;
  readonly valueStyleRevision: string | null;
  readonly visibleNonempty: boolean;
  readonly visualGenerationId: string;
  readonly wheelPolicy:
    | "none"
    | "viewport-pan"
    | "retained-scroll-or-editor-scroll"
    | "native-page";
  readonly zOrder: number;
};

export type GpuFlowCommittedSurfaceActorGenerationInput = Omit<
  GpuFlowCommittedSurfaceActorGeneration,
  | "accessibilityProjection"
  | "activationPolicy"
  | "actorFamily"
  | "browserVisual"
  | "canonicalActorId"
  | "generationClassification"
  | "semanticGenerationId"
  | "textCoverageProof"
  | "textSnapshotCacheKeyRevision"
  | "visualGenerationId"
> &
  Partial<
    Pick<
      GpuFlowCommittedSurfaceActorGeneration,
      | "accessibilityProjection"
      | "activationPolicy"
      | "actorFamily"
      | "browserVisual"
      | "semanticGenerationId"
      | "textCoverageProof"
      | "textSnapshotCacheKeyRevision"
      | "visualGenerationId"
    >
  >;

export type GpuFlowCommittedSurfaceCompleteness = {
  readonly blockingActorIds: readonly string[];
  readonly projectedVisibleNonemptyDomControlCount: number;
  readonly status: "blocked" | "complete" | "startup";
  readonly visibleNonemptyDomControlCount: number;
};

type GpuFlowCoverageBlockReason =
  | "text-actor-true-hole"
  | "visible-dom-control-not-projected";

type GpuFlowContentFramePublishabilityBase = {
  readonly blockingActorIds: readonly string[];
  readonly status: "blocked" | "publishable" | "startup";
  readonly textActorCount: number;
  readonly textActorExactCoverageCount: number;
  readonly transactionOutcome: string;
  readonly visibleNonemptyTextActorCount: number;
};

export type GpuFlowContentFramePublishability =
  | (GpuFlowContentFramePublishabilityBase & {
      readonly kind: "publishable";
    })
  | (GpuFlowContentFramePublishabilityBase & {
      readonly kind: "hold-previous";
      readonly reason: GpuFlowCoverageBlockReason;
    })
  | (GpuFlowContentFramePublishabilityBase & {
      readonly kind: "block-first-publication";
      readonly reason: GpuFlowCoverageBlockReason;
    })
  | (GpuFlowContentFramePublishabilityBase & {
      readonly actorFamily: "text-like-dom-control";
      readonly actorIds: readonly string[];
      readonly kind: "true-hole";
      readonly reason: "text-actor-true-hole";
    });

export type GpuFlowProjectionHorizon = {
  readonly actorFamilyCoverage: {
    readonly domControlActorIds: readonly string[];
    readonly domIslandActorIds: readonly string[];
    readonly gpuNativeVisualActorIds: readonly string[];
    readonly htmlTextureActorIds: readonly string[];
    readonly retainedPageActorIds: readonly string[];
  };
  readonly obligations: {
    readonly activePinnedActorIds: readonly string[];
    readonly maintenanceActorIds: readonly string[];
    readonly nearFutureActorIds: readonly string[];
    readonly visibleActorIds: readonly string[];
  };
  readonly retainedScrollSurfaces: readonly {
    readonly actorCount: number;
    readonly committedScrollOffset: {
      readonly x: number;
      readonly y: number;
    } | null;
    readonly preparedScrollRange: {
      readonly x: { readonly max: number; readonly min: number } | null;
      readonly y: { readonly max: number; readonly min: number } | null;
    };
    readonly surfaceId: string;
    readonly textActorCount: number;
    readonly visibleNonemptyTextActorCount: number;
  }[];
  readonly textActorCoverage: {
    readonly blockedAwaitingBrowserVisualActorIds: readonly string[];
    readonly blockedAwaitingLiveHostActorIds: readonly string[];
    readonly compatiblePreviousActorIds: readonly string[];
    readonly exactLiveDomActorIds: readonly string[];
    readonly exactSnapshotActorIds: readonly string[];
    readonly trueHoleActorIds: readonly string[];
  };
  readonly viewport: {
    readonly anchorFrameId: number;
    readonly mode: "transform-only";
    readonly overscanCssPx: number;
    readonly preparedBounds: null;
  };
};

export type GpuFlowCommittedSurfaceFrame = {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
  readonly coherence: GpuFlowCommittedSurfaceCoherence;
  readonly diagnostics: {
    readonly actorCount: number;
    readonly domControlActorCount: number;
    readonly domIslandActorCount: number;
    readonly gpuNativeVisualActorCount: number;
    readonly htmlTextureActorCount: number;
    readonly retainedPageActorCount: number;
    readonly textActorCount: number;
    readonly textActorExactCoverageCount: number;
    readonly transactionOutcome: string;
  };
  readonly displayCompleteness: GpuFlowCommittedSurfaceCompleteness;
  readonly displayFrameId: number;
  readonly id: number;
  readonly projectionHorizon: GpuFlowProjectionHorizon;
  readonly presentationProof: GpuFlowCommittedSurfacePresentationProof;
  readonly publishability: GpuFlowContentFramePublishability;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly sceneRevision: number;
  readonly surfaceTransaction: SurfaceDisplayTransaction | null;
  readonly viewportSample: GpuViewportInput;
};

export type GpuFlowCommittedSurfaceBrowserVisualReadiness = {
  readonly domControlReadinessByActorId: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  >;
  readonly domIslandReadinessByActorId: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  >;
};

export function createGpuFlowCommittedSurfaceFrame({
  browserVisualReadiness,
  gpuNativeVisuals,
  previousCommittedSurfaceFrame,
  retainedDisplayFrame,
}: {
  readonly browserVisualReadiness?:
    | GpuFlowCommittedSurfaceBrowserVisualReadiness
    | null
    | undefined;
  readonly gpuNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly previousCommittedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfaceFrame {
  const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
  const domControlActorOptions = createCommittedSurfaceDomControlActorOptions({
    browserVisualReadiness,
    previousCommittedSurfaceFrame,
    retainedDisplayFrame,
  });
  const domControlActorSet = createDomControlActorSet(
    retainedRuntimeFrame,
    domControlActorOptions,
  );
  const domIslandActorSet = createDomIslandActorSet({
    browserVisualReadinessByActorId:
      browserVisualReadiness?.domIslandReadinessByActorId,
    retainedRuntimeFrame,
  });
  const browserVisualSurfaceFragment =
    createGpuFlowCommittedSurfaceBrowserVisualFragment([
      ...domControlActorSet.browserVisualActors,
      ...domIslandActorSet.browserVisualActors,
    ]);
  const actorGenerations = Object.freeze([
    ...createRetainedPageActors(retainedDisplayFrame.surfaceActorSnapshots),
    ...createHtmlTextureActors({
      retainedRuntimeFrame,
      surfaces: retainedDisplayFrame.flatSurfaces,
    }),
    ...domControlActorSet.actorGenerations,
    ...domIslandActorSet.actorGenerations,
    ...createGpuNativeVisualActors({
      retainedRuntimeFrame,
      visuals:
        gpuNativeVisuals ??
        retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    }),
  ]);
  const frame = freezeCommittedSurfaceFrame({
    actorGenerations,
    browserVisualSurfaceFragment,
    displayFrameId: retainedDisplayFrame.id,
    retainedDisplayFrame,
    retainedRuntimeFrame,
    transactionOutcome: retainedDisplayFrame.diagnostics.transactionOutcome,
  });
  assertGpuFlowCommittedSurfaceFrameCoherent(frame);
  return frame;
}

export function createGpuFlowStartupCommittedSurfaceFrame({
  retainedRuntimeFrame,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceFrame {
  const domControlActorSet = createDomControlActorSet(retainedRuntimeFrame);
  const domIslandActorSet = createDomIslandActorSet({ retainedRuntimeFrame });
  const browserVisualSurfaceFragment =
    createGpuFlowCommittedSurfaceBrowserVisualFragment([
      ...domControlActorSet.browserVisualActors,
      ...domIslandActorSet.browserVisualActors,
    ]);
  const actorGenerations = Object.freeze([
    ...domControlActorSet.actorGenerations,
    ...domIslandActorSet.actorGenerations,
    ...createGpuNativeVisualActors({
      retainedRuntimeFrame,
      visuals: retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    }),
  ]);
  const frame = freezeCommittedSurfaceFrame({
    actorGenerations,
    browserVisualSurfaceFragment,
    displayFrameId: retainedRuntimeFrame.frameId,
    retainedDisplayFrame: null,
    retainedRuntimeFrame,
    transactionOutcome: "startup",
  });
  assertGpuFlowCommittedSurfaceFrameCoherent(frame);
  return frame;
}

export function createGpuFlowCommittedSurfaceFrameRenderSignature(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  return JSON.stringify({
    actorGenerations: frame.actorGenerations.map((actor) => [
      actor.actorId,
      actor.canonicalActorId,
      actor.generationClassification,
      actor.contentGenerationId,
      actor.layoutProjectionGenerationId,
      actor.readinessGenerationId,
      actor.browserVisual?.coverageState ?? "none",
      actor.browserVisual?.coverageRequired.required ?? false,
    ]),
    sceneRevision: frame.sceneRevision,
  });
}

function freezeCommittedSurfaceFrame({
  actorGenerations,
  browserVisualSurfaceFragment,
  displayFrameId,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  transactionOutcome,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
  readonly displayFrameId: number;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly transactionOutcome: string;
}): GpuFlowCommittedSurfaceFrame {
  const displayCompleteness = createGpuFlowCommittedSurfaceCompleteness({
    actorGenerations,
    startup: retainedDisplayFrame === null,
  });
  const publishability = createGpuFlowContentFramePublishability({
    actorGenerations,
    displayCompleteness,
    startup: retainedDisplayFrame === null,
    transactionOutcome,
  });
  const projectionHorizon = createGpuFlowProjectionHorizon({
    actorGenerations,
    displayFrameId,
  });
  const surfaceTransaction =
    retainedDisplayFrame && publishability.kind === "publishable"
      ? createGpuFlowCommittedSurfaceTransaction({
          browserVisualSurfaceFragment,
          displayFrameId: retainedDisplayFrame.id,
          retainedSurfaceTransaction: retainedDisplayFrame.surfaceTransaction,
        })
      : null;
  const clipChainRevision = createCommittedClipChainRevision({
    actorGenerations,
    retainedRuntimeFrame,
  });
  const hitGenerationId =
    surfaceTransaction?.hitIndex.id ??
    retainedDisplayFrame?.surfaceTransaction.hitIndex.id ??
    `startup-hit:${displayFrameId}`;
  const retainedScrollRevision = retainedRuntimeFrame.input.scrollRevision;
  const coherence = Object.freeze({
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision,
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision,
  });
  const presentationProof = createGpuFlowCommittedSurfacePresentationProof({
    actorGenerations,
    browserVisualSurfaceFragment,
    coherence,
    displayFrameId,
    surfaceTransaction,
  });
  return Object.freeze({
    actorGenerations,
    browserVisualSurfaceFragment,
    coherence,
    diagnostics: Object.freeze({
      actorCount: actorGenerations.length,
      domControlActorCount: actorGenerations.filter(
        (actor) => actor.kind === "dom-control",
      ).length,
      domIslandActorCount: actorGenerations.filter(
        (actor) => actor.kind === "dom-island",
      ).length,
      gpuNativeVisualActorCount: actorGenerations.filter(
        (actor) => actor.kind === "gpu-native-visual",
      ).length,
      htmlTextureActorCount: actorGenerations.filter(
        (actor) => actor.kind === "html-texture",
      ).length,
      retainedPageActorCount: actorGenerations.filter(
        (actor) => actor.kind === "retained-page",
      ).length,
      textActorCount: actorGenerations.filter(isGpuFlowCommittedTextActor)
        .length,
      textActorExactCoverageCount: actorGenerations.filter(
        (actor) =>
          actor.textCoverageProof?.projectionCoverage === "exact-live-dom" ||
          actor.textCoverageProof?.projectionCoverage === "exact-snapshot",
      ).length,
      transactionOutcome,
    }),
    displayCompleteness,
    displayFrameId,
    id: displayFrameId,
    projectionHorizon,
    presentationProof,
    publishability,
    retainedDisplayFrame,
    retainedRuntimeFrame,
    sceneRevision: retainedRuntimeFrame.input.sceneRevision,
    surfaceTransaction,
    viewportSample: retainedRuntimeFrame.input.viewport,
  });
}

function createRetainedPageActors(
  snapshots: readonly SurfaceActorSnapshot[],
): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    snapshots
      .filter(({ actor }) => actor.kind === "retained-parameter-content")
      .map(({ actor, generation }) =>
        freezeActor({
          active: false,
          actorId: actor.surfaceId,
          clipChainRevision: generation.generationId,
          clipRect: generation.clipRect,
          contentGenerationId: generation.generationId,
          controlId: null,
          focusIdentity: null,
          flowRect: generation.flowRect,
          generationId: generation.generationId,
          islandId: null,
          kind: "retained-page",
          layoutProjectionGenerationId: [
            "retained-page-layout",
            actor.surfaceId,
            rectKey(generation.flowRect),
            rectKey(generation.clipRect),
            rectKey(generation.sourceWindow.sourceRect),
            generation.zIndex,
          ].join("|"),
          liveMotionSampleId: "not-sampled",
          mountReadiness: "not-required",
          ownerSurfaceId: actor.surfaceId,
          pointerEvents: "none",
          projectionReadiness: "not-required",
          readinessGenerationId: "ready",
          retainedScrollOffset: null,
          retainedScrollRevision: 0,
          rowId: null,
          sourceRect: generation.sourceWindow.sourceRect,
          valueStyleRevision: null,
          visibleNonempty: false,
          wheelPolicy: "none",
          zOrder: generation.zIndex,
        }),
      ),
  );
}

function createHtmlTextureActors({
  retainedRuntimeFrame,
  surfaces,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly surfaces: readonly HtmlSurfaceFlatVisual[];
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    surfaces.map((surface, index) =>
      htmlTextureToActor({
        index,
        retainedRuntimeFrame,
        surface,
      }),
    ),
  );
}

function htmlTextureToActor({
  index,
  retainedRuntimeFrame,
  surface,
}: {
  readonly index: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly surface: HtmlSurfaceFlatVisual;
}): GpuFlowCommittedSurfaceActorGeneration {
  const flowRect = {
    height: surface.height,
    width: surface.width,
    x: surface.x,
    y: surface.y,
  };
  const sourceRect = getHtmlTextureSourceRect(surface);
  const retainedScrollRevision = getGpuFlowCommittedSurfaceActorScrollRevision({
    retainedRuntimeFrame,
    surfaceId: surface.surfaceId,
  });
  const contentGenerationId = [
    "html-texture-content",
    surface.surfaceId,
    surface.texture.textureContentKey ?? "content:unknown",
    surface.texture.zoomBucket,
  ].join("|");
  const layoutProjectionGenerationId = [
    "html-texture-layout",
    surface.surfaceId,
    index,
    rectKey(flowRect),
    rectKey(sourceRect),
    retainedScrollRevision,
    surface.zIndex,
  ].join("|");
  return freezeActor({
    active: false,
    actorId: `${surface.surfaceId}:html-texture:${index}`,
    clipChainRevision: surface.surfaceId,
    clipRect: flowRect,
    contentGenerationId,
    controlId: null,
    focusIdentity: null,
    flowRect,
    generationId: [
      contentGenerationId,
      layoutProjectionGenerationId,
      "ready",
    ].join("|"),
    islandId: null,
    kind: "html-texture",
    layoutProjectionGenerationId,
    liveMotionSampleId: "not-sampled",
    mountReadiness: "not-required",
    ownerSurfaceId: surface.surfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
    readinessGenerationId: "ready",
    retainedScrollOffset: null,
    retainedScrollRevision,
    rowId: null,
    sourceRect,
    valueStyleRevision: null,
    visibleNonempty: false,
    wheelPolicy: "none",
    zOrder: surface.zIndex,
  });
}

function getHtmlTextureSourceRect(surface: HtmlSurfaceFlatVisual): GpuRect {
  return (
    surface.texture.textureSourceRect ?? {
      height: surface.texture.cssHeight,
      width: surface.texture.cssWidth,
      x: 0,
      y: 0,
    }
  );
}

type BrowserVisualCommittedActorSet = {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly browserVisualActors: readonly BrowserVisualActor[];
};

function createDomIslandActorSet({
  browserVisualReadinessByActorId,
  retainedRuntimeFrame,
}: {
  readonly browserVisualReadinessByActorId?:
    | ReadonlyMap<string, BrowserVisualActorRepresentationReadiness>
    | null
    | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): BrowserVisualCommittedActorSet {
  const actorRecords = retainedRuntimeFrame.descriptors.nativeDomIslands.map(
    (island) =>
      domIslandToActorRecord({
        browserVisualReadiness:
          browserVisualReadinessByActorId?.get(island.id) ?? null,
        island,
        retainedRuntimeFrame,
      }),
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

function domIslandToActorRecord({
  browserVisualReadiness,
  island,
  retainedRuntimeFrame,
}: {
  readonly browserVisualReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly island: GpuDomIsland;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): {
  readonly actorGeneration: GpuFlowCommittedSurfaceActorGeneration;
  readonly browserVisualActor: BrowserVisualActor;
} {
  const browserVisual = createDomIslandBrowserVisualActor(island, {
    representationReadiness: browserVisualReadiness,
  });
  const browserVisualCoverageReady =
    browserVisual.coverageState === "live-host-ready" ||
    browserVisual.coverageState === "exact-snapshot-ready" ||
    browserVisual.coverageState === "compatible-previous-ready";
  const browserVisualReadinessState = browserVisual.coverageRequired.required
    ? browserVisualCoverageReady
      ? "ready"
      : "not-required"
    : "not-required";
  const ownerSurfaceId =
    island.source.kind === "retained-content"
      ? island.source.surfaceId
      : island.clipOwnerId;
  const retainedScrollRevision = getGpuFlowCommittedSurfaceActorScrollRevision({
    retainedRuntimeFrame,
    surfaceId: ownerSurfaceId,
  });
  const contentGenerationId = [
    "dom-island-content",
    island.id,
    island.kind,
    island.source.kind === "retained-content"
      ? island.source.ownerRowId
      : "custom",
  ].join("|");
  const layoutProjectionGenerationId = [
    "dom-island-layout",
    island.id,
    island.clipOwnerId,
    rectKey(island.rect),
    rectKey(island.contentRect),
    retainedScrollRevision,
  ].join("|");
  const readinessGenerationId = [
    "dom-island-readiness",
    island.id,
    "ready",
  ].join("|");
  return Object.freeze({
    actorGeneration: freezeActor({
      active: true,
      actorId: island.id,
      browserVisual,
      clipChainRevision: island.clipOwnerId,
      clipRect: island.rect,
      contentGenerationId,
      controlId: null,
      focusIdentity: island.id,
      flowRect: island.rect,
      generationId: [
        contentGenerationId,
        layoutProjectionGenerationId,
        readinessGenerationId,
      ].join("|"),
      islandId: island.id,
      kind: "dom-island",
      layoutProjectionGenerationId,
      liveMotionSampleId: "not-sampled",
      mountReadiness: browserVisualReadinessState,
      ownerSurfaceId,
      pointerEvents: "auto",
      projectionReadiness: browserVisualReadinessState,
      readinessGenerationId,
      retainedScrollOffset: null,
      retainedScrollRevision,
      rowId: null,
      sourceRect: island.contentRect,
      valueStyleRevision: null,
      visibleNonempty: false,
      wheelPolicy: "native-page",
      zOrder: island.zIndex,
    }),
    browserVisualActor: browserVisual,
  });
}

function createCommittedClipChainRevision({
  actorGenerations,
  retainedRuntimeFrame,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): string {
  return [
    retainedRuntimeFrame.input.sceneRevision,
    ...actorGenerations.map((actor) => actor.layoutProjectionGenerationId),
  ].join("|");
}

function createCommittedSurfaceDomControlActorOptions({
  browserVisualReadiness,
  previousCommittedSurfaceFrame,
  retainedDisplayFrame,
}: {
  readonly browserVisualReadiness?:
    | GpuFlowCommittedSurfaceBrowserVisualReadiness
    | null
    | undefined;
  readonly previousCommittedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): DomControlActorOptions {
  const browserVisualReadinessByActorId =
    browserVisualReadiness?.domControlReadinessByActorId;
  const options: DomControlActorOptions = browserVisualReadinessByActorId
    ? {
        browserVisualReadinessByActorId,
        currentPublishedAtMs: retainedDisplayFrame.diagnostics.publishedAtMs,
      }
    : { currentPublishedAtMs: retainedDisplayFrame.diagnostics.publishedAtMs };
  if (!previousCommittedSurfaceFrame) {
    return options;
  }
  return {
    ...options,
    previousCommittedFrameId: previousCommittedSurfaceFrame.displayFrameId,
    previousCommittedSurfaceActors:
      previousCommittedSurfaceFrame.actorGenerations,
    previousRetainedRuntimeFrame:
      previousCommittedSurfaceFrame.retainedRuntimeFrame,
    previousPublishedAtMs:
      previousCommittedSurfaceFrame.retainedDisplayFrame?.diagnostics
        .publishedAtMs ?? null,
    previousTransactionId: createGpuFlowCommittedSurfacePreviousTransactionId(
      previousCommittedSurfaceFrame,
    ),
  };
}

function createGpuFlowCommittedSurfacePreviousTransactionId(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  if (frame.surfaceTransaction) {
    return frame.surfaceTransaction.id;
  }
  return [
    "committed-surface",
    frame.displayFrameId,
    frame.coherence.hitGenerationId,
    frame.diagnostics.transactionOutcome,
  ].join("|");
}
