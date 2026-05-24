import { createGpuFlowJsonDigest } from "./gpuFlowDigest";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import { freezeActor } from "./preparedContentActorFreeze";
import type {
  GpuFlowPreparedContentActorGenerationClassification,
  GpuFlowPreparedContentCanonicalActorId,
} from "./preparedContentActorIdentity";
import type { GpuFlowPreparedContentBrowserVisualContract } from "./preparedContentBrowserVisualContract";
import {
  createGpuFlowPreparedContentBrowserVisualFragment,
  createGpuFlowPreparedContentTransaction,
} from "./preparedContentBrowserVisualFragment";
import {
  createGpuFlowPreparedContentCompleteness,
  isGpuFlowPreparedContentCompletenessBlockingActor,
} from "./preparedContentCompleteness";
import {
  createGpuFlowContentFramePublishability,
  createGpuFlowPreparedContentRetainedTrueHoleActorIds,
  createGpuFlowProjectionHorizon,
  isGpuFlowPreparedTextActor,
} from "./preparedContentFrameProjection";
import {
  createGpuNativeVisualActors,
  getGpuFlowPreparedContentActorScrollRevision,
  rectKey,
} from "./preparedContentGpuNativeVisualActor";
import {
  assertGpuFlowPreparedContentFrameCoherent,
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentCoherence,
  type GpuFlowPreparedContentDomPresentationEvidence,
  type GpuFlowPreparedContentPresentationProof,
} from "./preparedContentPresentationProof";
import {
  intersectPreparedContentFrameRects,
  isPositivePreparedContentRect,
} from "./preparedContentRects";
import { createSectionStructureActors } from "./preparedContentSectionActors";
import {
  createDomControlActorSet,
  type DomControlActorOptions,
} from "./preparedContentTextActor";
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

export type { GpuFlowPreparedContentBrowserVisualContract } from "./preparedContentBrowserVisualContract";
export {
  assertGpuFlowPreparedContentFrameCoherent,
  assertGpuFlowPreparedContentPresentationProof,
  createGpuFlowPreparedContentActorManifestDigest,
  createGpuFlowPreparedContentDomPresentationEvidence,
  createGpuFlowPreparedContentPresentationProof,
} from "./preparedContentPresentationProof";
export type { GpuFlowPreparedContentDomPresentationEvidence } from "./preparedContentPresentationProof";

type GpuFlowPreparedContentActorKind =
  | "retained-page"
  | "dom-control"
  | "dom-island"
  | "html-texture"
  | "gpu-native-visual";

export type GpuFlowPreparedContentSectionActorFamily =
  | "section-body-clip"
  | "section-header"
  | "section-shell";

type GpuFlowPreparedContentActorFamily =
  | GpuFlowPreparedContentActorKind
  | GpuFlowPreparedContentSectionActorFamily
  | "text-like-dom-control";

const preparedContentFrameRenderSignatureCache = new WeakMap<
  GpuFlowPreparedContentFrame,
  string
>();

export type GpuFlowTextActorActivationPolicy =
  | "allowed"
  | "requires-current-visual"
  | "queue-until-ready";

type GpuFlowPreparedContentTextCoverageProofBase = {
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

export type GpuFlowPreparedContentCompatiblePreviousProof = {
  readonly activationPolicy: string;
  readonly actorFamily: string;
  readonly actorId: string;
  readonly budgetState: "over-budget" | "within-budget";
  readonly canonicalActorId: GpuFlowPreparedContentCanonicalActorId;
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
  readonly previousContentFrameId: number;
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

export type GpuFlowPreparedContentTextCoverageProof =
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly projectionCoverage: "exact-live-dom";
    })
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly projectionCoverage: "exact-snapshot";
      readonly snapshotSurfaceId: string;
    })
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly compatiblePreviousProof: GpuFlowPreparedContentCompatiblePreviousProof;
      readonly previousVisualGenerationId: string;
      readonly projectionCoverage: "compatible-previous";
    })
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly projectionCoverage: "blocked-awaiting-browser-visual";
      readonly readinessReason: "snapshot-pending" | "live-dom-budget";
    })
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly projectionCoverage: "blocked-awaiting-live-host";
      readonly readinessReason: "live-dom-budget";
    })
  | (GpuFlowPreparedContentTextCoverageProofBase & {
      readonly projectionCoverage: "true-hole";
      readonly readinessReason: "clipped-empty" | "missing-browser-visual";
    });

export type GpuFlowPreparedContentActorGeneration = {
  readonly active: boolean;
  readonly accessibilityProjection: "browser-dom" | "none";
  readonly activationPolicy: GpuFlowTextActorActivationPolicy | "none";
  readonly actorId: string;
  readonly actorFamily: GpuFlowPreparedContentActorFamily;
  readonly browserVisual: GpuFlowPreparedContentBrowserVisualContract | null;
  readonly canonicalActorId: GpuFlowPreparedContentCanonicalActorId;
  readonly clipChainRevision: string;
  readonly clipRect: GpuRect;
  readonly contentGenerationId: string;
  readonly controlId: string | null;
  readonly focusIdentity: string | null;
  readonly flowRect: GpuRect;
  readonly generationId: string;
  readonly generationClassification: GpuFlowPreparedContentActorGenerationClassification;
  readonly islandId: string | null;
  readonly kind: GpuFlowPreparedContentActorKind;
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
  readonly textCoverageProof: GpuFlowPreparedContentTextCoverageProof | null;
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

export type GpuFlowPreparedContentActorGenerationInput = Omit<
  GpuFlowPreparedContentActorGeneration,
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
      GpuFlowPreparedContentActorGeneration,
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

export type GpuFlowPreparedContentCompleteness = {
  readonly blockingActorIds: readonly string[];
  readonly projectedVisibleNonemptyDomControlCount: number;
  readonly status: "blocked" | "complete" | "startup";
  readonly visibleNonemptyDomControlCount: number;
};
type GpuFlowCoverageBlockReason =
  | "retained-surface-true-hole"
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
      readonly actorFamily: "retained-page" | "text-like-dom-control";
      readonly actorIds: readonly string[];
      readonly kind: "true-hole";
      readonly reason: "retained-surface-true-hole" | "text-actor-true-hole";
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
    readonly preparedScrollOffset: {
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

export type GpuFlowPreparedContentFrame = {
  readonly actorGenerations: readonly GpuFlowPreparedContentActorGeneration[];
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
  readonly coherence: GpuFlowPreparedContentCoherence;
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
  readonly displayCompleteness: GpuFlowPreparedContentCompleteness;
  readonly displayFrameId: number;
  readonly id: number;
  readonly projectionHorizon: GpuFlowProjectionHorizon;
  readonly presentationProof: GpuFlowPreparedContentPresentationProof;
  readonly publishability: GpuFlowContentFramePublishability;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly sceneRevision: number;
  readonly surfaceTransaction: SurfaceDisplayTransaction | null;
  readonly viewportSample: GpuViewportInput;
};

export type GpuFlowPreparedContentBrowserVisualReadiness = {
  readonly domControlReadinessByActorId: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  >;
  readonly domIslandReadinessByActorId: ReadonlyMap<
    string,
    BrowserVisualActorRepresentationReadiness
  >;
};

export function createGpuFlowPreparedContentFrame({
  browserVisualReadiness,
  domPresentationEvidence,
  gpuNativeVisuals,
  previousPreparedContentFrame,
  retainedDisplayFrame,
}: {
  readonly browserVisualReadiness?:
    | GpuFlowPreparedContentBrowserVisualReadiness
    | null
    | undefined;
  readonly domPresentationEvidence?:
    | GpuFlowPreparedContentDomPresentationEvidence
    | undefined;
  readonly gpuNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly previousPreparedContentFrame?:
    | GpuFlowPreparedContentFrame
    | null
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): GpuFlowPreparedContentFrame {
  const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
  const domControlActorOptions = createPreparedContentDomControlActorOptions({
    browserVisualReadiness,
    previousPreparedContentFrame,
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
    createGpuFlowPreparedContentBrowserVisualFragment([
      ...domControlActorSet.browserVisualActors,
      ...domIslandActorSet.browserVisualActors,
    ]);
  const actorGenerations = Object.freeze([
    ...createSectionStructureActors(retainedRuntimeFrame),
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
  const frame = freezePreparedContentFrame({
    actorGenerations,
    browserVisualSurfaceFragment,
    displayFrameId: retainedDisplayFrame.id,
    domPresentationEvidence,
    retainedDisplayFrame,
    retainedRuntimeFrame,
    transactionOutcome: retainedDisplayFrame.diagnostics.transactionOutcome,
  });
  assertGpuFlowPreparedContentFrameCoherent(frame);
  return frame;
}

export function createGpuFlowStartupPreparedContentFrame({
  retainedRuntimeFrame,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowPreparedContentFrame {
  const domControlActorSet = createDomControlActorSet(retainedRuntimeFrame);
  const domIslandActorSet = createDomIslandActorSet({ retainedRuntimeFrame });
  const browserVisualSurfaceFragment =
    createGpuFlowPreparedContentBrowserVisualFragment([
      ...domControlActorSet.browserVisualActors,
      ...domIslandActorSet.browserVisualActors,
    ]);
  const actorGenerations = Object.freeze([
    ...createSectionStructureActors(retainedRuntimeFrame),
    ...domControlActorSet.actorGenerations,
    ...domIslandActorSet.actorGenerations,
    ...createGpuNativeVisualActors({
      retainedRuntimeFrame,
      visuals: retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    }),
  ]);
  const frame = freezePreparedContentFrame({
    actorGenerations,
    browserVisualSurfaceFragment,
    displayFrameId: retainedRuntimeFrame.frameId,
    domPresentationEvidence: undefined,
    retainedDisplayFrame: null,
    retainedRuntimeFrame,
    transactionOutcome: "startup",
  });
  assertGpuFlowPreparedContentFrameCoherent(frame);
  return frame;
}

export function createGpuFlowPreparedContentFrameRenderSignature(
  frame: GpuFlowPreparedContentFrame,
): string {
  const cached = preparedContentFrameRenderSignatureCache.get(frame);
  if (cached !== undefined) {
    return cached;
  }
  const signature = createGpuFlowJsonDigest("prepared-content-render", {
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
  preparedContentFrameRenderSignatureCache.set(frame, signature);
  return signature;
}

function freezePreparedContentFrame({
  actorGenerations,
  browserVisualSurfaceFragment,
  displayFrameId,
  domPresentationEvidence,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  transactionOutcome,
}: {
  readonly actorGenerations: readonly GpuFlowPreparedContentActorGeneration[];
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
  readonly displayFrameId: number;
  readonly domPresentationEvidence:
    | GpuFlowPreparedContentDomPresentationEvidence
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly transactionOutcome: string;
}): GpuFlowPreparedContentFrame {
  const displayCompleteness = createGpuFlowPreparedContentCompleteness({
    actorGenerations,
    startup: retainedDisplayFrame === null,
  });
  const publishability = createGpuFlowContentFramePublishability({
    actorGenerations,
    displayCompleteness,
    retainedSurfaceTrueHoleActorIds:
      createGpuFlowPreparedContentRetainedTrueHoleActorIds(
        retainedDisplayFrame,
      ),
    startup: retainedDisplayFrame === null,
    transactionOutcome,
  });
  const projectionHorizon = createGpuFlowProjectionHorizon({
    actorGenerations,
    displayFrameId,
  });
  const surfaceTransaction =
    retainedDisplayFrame && publishability.kind === "publishable"
      ? createGpuFlowPreparedContentTransaction({
          browserVisualSurfaceFragment,
          displayFrameId: retainedDisplayFrame.id,
          maintenanceBlockingSurfaceIds:
            createGpuFlowPreparedContentMaintenanceBlockingSurfaceIds(
              actorGenerations,
            ),
          retainedSurfaceTransaction: retainedDisplayFrame.surfaceTransaction,
        })
      : null;
  const clipChainRevision = createPreparedClipChainRevision({
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
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId,
    htmlTextureOverlayPreparedFrameId: displayFrameId,
    retainedScrollRevision,
  });
  const presentationProof = createGpuFlowPreparedContentPresentationProof({
    actorGenerations,
    browserVisualSurfaceFragment,
    coherence,
    displayFrameId,
    domGenerationEvidence: domPresentationEvidence,
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
      textActorCount: actorGenerations.filter(isGpuFlowPreparedTextActor)
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

function createGpuFlowPreparedContentMaintenanceBlockingSurfaceIds(
  actorGenerations: readonly GpuFlowPreparedContentActorGeneration[],
): readonly string[] {
  return Object.freeze(
    actorGenerations
      .filter(
        (actor) =>
          actor.kind === "dom-control" &&
          actor.browserVisual !== null &&
          isGpuFlowPreparedContentMaintenanceBlockingCoverageState(
            actor.browserVisual.coverageState,
          ) &&
          !isGpuFlowPreparedContentCompletenessBlockingActor({
            actor,
            startup: false,
          }),
      )
      .map((actor) => `dom-control:${actor.actorId}`),
  );
}

function isGpuFlowPreparedContentMaintenanceBlockingCoverageState(
  coverageState: NonNullable<
    GpuFlowPreparedContentActorGeneration["browserVisual"]
  >["coverageState"],
): boolean {
  return (
    coverageState === "blocked-awaiting-live-host" ||
    coverageState === "blocked-awaiting-snapshot"
  );
}

function createRetainedPageActors(
  snapshots: readonly SurfaceActorSnapshot[],
): readonly GpuFlowPreparedContentActorGeneration[] {
  return Object.freeze(
    snapshots
      .filter(({ actor }) => actor.kind === "retained-parameter-content")
      .map(({ actor, generation }) => {
        const visibleRect = intersectPreparedContentFrameRects(
          generation.flowRect,
          generation.clipRect,
        );
        return freezeActor({
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
          visibleNonempty: isPositivePreparedContentRect(visibleRect),
          wheelPolicy: "none",
          zOrder: generation.zIndex,
        });
      }),
  );
}

function createHtmlTextureActors({
  retainedRuntimeFrame,
  surfaces,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly surfaces: readonly HtmlSurfaceFlatVisual[];
}): readonly GpuFlowPreparedContentActorGeneration[] {
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
}): GpuFlowPreparedContentActorGeneration {
  const flowRect = {
    height: surface.height,
    width: surface.width,
    x: surface.x,
    y: surface.y,
  };
  const sourceRect = getHtmlTextureSourceRect(surface);
  const retainedScrollRevision = getGpuFlowPreparedContentActorScrollRevision({
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

type BrowserVisualPreparedActorSet = {
  readonly actorGenerations: readonly GpuFlowPreparedContentActorGeneration[];
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
}): BrowserVisualPreparedActorSet {
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
  readonly actorGeneration: GpuFlowPreparedContentActorGeneration;
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
  const retainedScrollRevision = getGpuFlowPreparedContentActorScrollRevision({
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

function createPreparedClipChainRevision({
  actorGenerations,
  retainedRuntimeFrame,
}: {
  readonly actorGenerations: readonly GpuFlowPreparedContentActorGeneration[];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): string {
  return [
    retainedRuntimeFrame.input.sceneRevision,
    ...actorGenerations.map((actor) => actor.layoutProjectionGenerationId),
  ].join("|");
}

function createPreparedContentDomControlActorOptions({
  browserVisualReadiness,
  previousPreparedContentFrame,
  retainedDisplayFrame,
}: {
  readonly browserVisualReadiness?:
    | GpuFlowPreparedContentBrowserVisualReadiness
    | null
    | undefined;
  readonly previousPreparedContentFrame?:
    | GpuFlowPreparedContentFrame
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
  if (!previousPreparedContentFrame) {
    return options;
  }
  return {
    ...options,
    previousContentFrameId: previousPreparedContentFrame.displayFrameId,
    previousPreparedContentActors:
      previousPreparedContentFrame.actorGenerations,
    previousRetainedRuntimeFrame:
      previousPreparedContentFrame.retainedRuntimeFrame,
    previousPublishedAtMs:
      previousPreparedContentFrame.retainedDisplayFrame?.diagnostics
        .publishedAtMs ?? null,
    previousTransactionId: createGpuFlowPreparedContentPreviousTransactionId(
      previousPreparedContentFrame,
    ),
  };
}

function createGpuFlowPreparedContentPreviousTransactionId(
  frame: GpuFlowPreparedContentFrame,
): string {
  if (frame.surfaceTransaction) {
    return frame.surfaceTransaction.id;
  }
  return [
    "prepared-content",
    frame.displayFrameId,
    frame.coherence.hitGenerationId,
    frame.diagnostics.transactionOutcome,
  ].join("|");
}
