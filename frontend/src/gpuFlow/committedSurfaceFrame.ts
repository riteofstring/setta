import {
  assertGpuFlowContentFramePublishability,
  assertGpuFlowProjectionHorizon,
  createGpuFlowContentFramePublishability,
  createGpuFlowProjectionHorizon,
  isGpuFlowCommittedTextActor,
} from "./committedSurfaceFrameProjection";
import { createDomControlActors } from "./committedSurfaceTextActor";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuDomIsland } from "./scene";
import type { SurfaceActorSnapshot } from "./surfaceCompositor/surfaceActor";
import type { GpuRect, GpuViewportInput } from "./viewportMath";

type GpuFlowCommittedSurfaceActorKind =
  | "retained-page"
  | "dom-control"
  | "dom-island"
  | "html-texture"
  | "gpu-native-visual";

type GpuFlowCommittedSurfaceActorFamily =
  | GpuFlowCommittedSurfaceActorKind
  | "text-like-dom-control";

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

export type GpuFlowCommittedSurfaceTextCoverageProof =
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "exact-live-dom";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "exact-snapshot";
      readonly snapshotSurfaceId: string;
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly previousVisualGenerationId: string;
      readonly projectionCoverage: "compatible-previous";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "blocked-awaiting-browser-visual";
      readonly readinessReason: "snapshot-pending" | "live-dom-budget";
    })
  | (GpuFlowCommittedSurfaceTextCoverageProofBase & {
      readonly projectionCoverage: "true-hole";
      readonly readinessReason: "clipped-empty" | "missing-browser-visual";
    });

export type GpuFlowCommittedSurfaceActorGeneration = {
  readonly active: boolean;
  readonly accessibilityProjection: "browser-dom" | "none";
  readonly activationPolicy: GpuFlowTextActorActivationPolicy | "none";
  readonly actorId: string;
  readonly actorFamily: GpuFlowCommittedSurfaceActorFamily;
  readonly clipChainRevision: string;
  readonly clipRect: GpuRect;
  readonly contentGenerationId: string;
  readonly controlId: string | null;
  readonly focusIdentity: string | null;
  readonly flowRect: GpuRect;
  readonly generationId: string;
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

type GpuFlowCommittedSurfaceActorGenerationInput = Omit<
  GpuFlowCommittedSurfaceActorGeneration,
  | "accessibilityProjection"
  | "activationPolicy"
  | "actorFamily"
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

type GpuFlowCommittedSurfaceCoherence = {
  readonly canvasRetainedFrameId: number;
  readonly clipChainRevision: string;
  readonly debugSnapshotFrameId: number;
  readonly domControlCommittedFrameId: number;
  readonly domIslandCommittedFrameId: number;
  readonly gpuNativeVisualCommittedFrameId: number;
  readonly hitGenerationId: string;
  readonly htmlTextureOverlayCommittedFrameId: number;
  readonly retainedScrollRevision: number;
};

export type GpuFlowProjectionHorizon = {
  readonly actorFamilyCoverage: {
    readonly domControlActorIds: readonly string[];
    readonly domIslandActorIds: readonly string[];
    readonly gpuNativeVisualActorIds: readonly string[];
    readonly htmlTextureActorIds: readonly string[];
    readonly retainedPageActorIds: readonly string[];
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
  readonly publishability: GpuFlowContentFramePublishability;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly sceneRevision: number;
  readonly viewportSample: GpuViewportInput;
};

export function createGpuFlowCommittedSurfaceFrame({
  gpuNativeVisuals,
  retainedDisplayFrame,
}: {
  readonly gpuNativeVisuals?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfaceFrame {
  const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
  const actorGenerations = Object.freeze([
    ...createRetainedPageActors(retainedDisplayFrame.surfaceActorSnapshots),
    ...createHtmlTextureActors({
      retainedRuntimeFrame,
      surfaces: retainedDisplayFrame.flatSurfaces,
    }),
    ...createDomControlActors(retainedRuntimeFrame),
    ...createDomIslandActors(retainedRuntimeFrame),
    ...createGpuNativeVisualActors({
      retainedRuntimeFrame,
      visuals:
        gpuNativeVisuals ??
        retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    }),
  ]);
  const frame = freezeCommittedSurfaceFrame({
    actorGenerations,
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
  const actorGenerations = Object.freeze([
    ...createDomControlActors(retainedRuntimeFrame),
    ...createDomIslandActors(retainedRuntimeFrame),
    ...createGpuNativeVisualActors({
      retainedRuntimeFrame,
      visuals: retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    }),
  ]);
  const frame = freezeCommittedSurfaceFrame({
    actorGenerations,
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
      actor.contentGenerationId,
      actor.layoutProjectionGenerationId,
      actor.readinessGenerationId,
    ]),
    sceneRevision: frame.sceneRevision,
  });
}

export function assertGpuFlowCommittedSurfaceFrameCoherent(
  frame: GpuFlowCommittedSurfaceFrame,
): void {
  const committedFrameIds = [
    frame.coherence.canvasRetainedFrameId,
    frame.coherence.debugSnapshotFrameId,
    frame.coherence.domControlCommittedFrameId,
    frame.coherence.domIslandCommittedFrameId,
    frame.coherence.gpuNativeVisualCommittedFrameId,
    frame.coherence.htmlTextureOverlayCommittedFrameId,
  ];
  if (committedFrameIds.some((frameId) => frameId !== frame.displayFrameId)) {
    throw new Error(
      "GPU Flow committed surface frame has incoherent visible frame ids.",
    );
  }
  if (
    frame.coherence.retainedScrollRevision !==
    frame.retainedRuntimeFrame.input.scrollRevision
  ) {
    throw new Error(
      "GPU Flow committed surface frame has an incoherent retained scroll revision.",
    );
  }
  const expectedCompleteness = createGpuFlowCommittedSurfaceCompleteness({
    actorGenerations: frame.actorGenerations,
    startup: frame.retainedDisplayFrame === null,
  });
  assertGpuFlowCommittedSurfaceCompleteness(
    frame.displayCompleteness,
    expectedCompleteness,
  );
  if (expectedCompleteness.blockingActorIds.length > 0) {
    throw new Error(
      "GPU Flow committed surface frame has unprojected visible nonempty DOM controls.",
    );
  }
  assertGpuFlowContentFramePublishability(
    frame.publishability,
    createGpuFlowContentFramePublishability({
      actorGenerations: frame.actorGenerations,
      displayCompleteness: expectedCompleteness,
      startup: frame.retainedDisplayFrame === null,
      transactionOutcome: frame.diagnostics.transactionOutcome,
    }),
  );
  assertGpuFlowProjectionHorizon(
    frame.projectionHorizon,
    createGpuFlowProjectionHorizon({
      actorGenerations: frame.actorGenerations,
      displayFrameId: frame.displayFrameId,
    }),
  );
}

function freezeCommittedSurfaceFrame({
  actorGenerations,
  displayFrameId,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  transactionOutcome,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
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
  const clipChainRevision = createCommittedClipChainRevision({
    actorGenerations,
    retainedRuntimeFrame,
  });
  return Object.freeze({
    actorGenerations,
    coherence: Object.freeze({
      canvasRetainedFrameId: displayFrameId,
      clipChainRevision,
      debugSnapshotFrameId: displayFrameId,
      domControlCommittedFrameId: displayFrameId,
      domIslandCommittedFrameId: displayFrameId,
      gpuNativeVisualCommittedFrameId: displayFrameId,
      hitGenerationId:
        retainedDisplayFrame?.surfaceTransaction.hitIndex.id ??
        `startup-hit:${displayFrameId}`,
      htmlTextureOverlayCommittedFrameId: displayFrameId,
      retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
    }),
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
    publishability,
    retainedDisplayFrame,
    retainedRuntimeFrame,
    sceneRevision: retainedRuntimeFrame.input.sceneRevision,
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

function createDomIslandActors(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame,
): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    retainedRuntimeFrame.descriptors.nativeDomIslands.map((island) =>
      domIslandToActor({
        island,
        retainedRuntimeFrame,
      }),
    ),
  );
}

function domIslandToActor({
  island,
  retainedRuntimeFrame,
}: {
  readonly island: GpuDomIsland;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceActorGeneration {
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
  return freezeActor({
    active: true,
    actorId: island.id,
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
    mountReadiness: "ready",
    ownerSurfaceId,
    pointerEvents: "auto",
    projectionReadiness: "ready",
    readinessGenerationId,
    retainedScrollOffset: null,
    retainedScrollRevision,
    rowId: null,
    sourceRect: island.contentRect,
    valueStyleRevision: null,
    visibleNonempty: false,
    wheelPolicy: "native-page",
    zOrder: island.zIndex,
  });
}

function createGpuNativeVisualActors({
  retainedRuntimeFrame,
  visuals,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly visuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    visuals.map((visual, index) =>
      gpuNativeVisualToActor({
        index,
        retainedRuntimeFrame,
        visual,
      }),
    ),
  );
}

function gpuNativeVisualToActor({
  index,
  retainedRuntimeFrame,
  visual,
}: {
  readonly index: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly visual: HtmlSurfaceSolidRoundedRectVisual;
}): GpuFlowCommittedSurfaceActorGeneration {
  const retainedScrollRevision = getGpuFlowCommittedSurfaceActorScrollRevision({
    retainedRuntimeFrame,
    surfaceId: visual.surfaceId,
  });
  const contentGenerationId = [
    "gpu-native-visual-content",
    visual.surfaceId,
    visual.radius,
    colorKey(visual.color),
  ].join("|");
  const layoutProjectionGenerationId = [
    "gpu-native-visual-layout",
    visual.surfaceId,
    index,
    rectKey(visual.rect),
    retainedScrollRevision,
    visual.zIndex,
  ].join("|");
  return freezeActor({
    active: false,
    actorId: `${visual.surfaceId}:native-visual:${index}`,
    clipChainRevision: visual.surfaceId,
    clipRect: visual.rect,
    contentGenerationId,
    controlId: null,
    focusIdentity: null,
    flowRect: visual.rect,
    generationId: [
      contentGenerationId,
      layoutProjectionGenerationId,
      "ready",
    ].join("|"),
    islandId: null,
    kind: "gpu-native-visual",
    layoutProjectionGenerationId,
    liveMotionSampleId: "not-sampled",
    mountReadiness: "not-required",
    ownerSurfaceId: visual.surfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
    readinessGenerationId: "ready",
    retainedScrollOffset: null,
    retainedScrollRevision,
    rowId: null,
    sourceRect: visual.rect,
    valueStyleRevision: [visual.radius, colorKey(visual.color)].join("|"),
    visibleNonempty: false,
    wheelPolicy: "none",
    zOrder: visual.zIndex,
  });
}

function createGpuFlowCommittedSurfaceCompleteness({
  actorGenerations,
  startup,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly startup: boolean;
}): GpuFlowCommittedSurfaceCompleteness {
  const visibleNonemptyDomControls = actorGenerations.filter(
    (actor) => actor.kind === "dom-control" && actor.visibleNonempty,
  );
  const projectedVisibleNonemptyDomControls = visibleNonemptyDomControls.filter(
    (actor) =>
      actor.mountReadiness === "ready" && actor.projectionReadiness === "ready",
  );
  const blockingActorIds = visibleNonemptyDomControls
    .filter(
      (actor) =>
        actor.mountReadiness !== "ready" ||
        actor.projectionReadiness !== "ready",
    )
    .map((actor) => actor.actorId);
  const status =
    blockingActorIds.length === 0
      ? "complete"
      : startup
        ? "startup"
        : "blocked";
  return Object.freeze({
    blockingActorIds: Object.freeze(blockingActorIds),
    projectedVisibleNonemptyDomControlCount:
      projectedVisibleNonemptyDomControls.length,
    status,
    visibleNonemptyDomControlCount: visibleNonemptyDomControls.length,
  });
}

function assertGpuFlowCommittedSurfaceCompleteness(
  left: GpuFlowCommittedSurfaceCompleteness,
  right: GpuFlowCommittedSurfaceCompleteness,
): void {
  if (
    left.status !== right.status ||
    left.visibleNonemptyDomControlCount !==
      right.visibleNonemptyDomControlCount ||
    left.projectedVisibleNonemptyDomControlCount !==
      right.projectedVisibleNonemptyDomControlCount ||
    left.blockingActorIds.length !== right.blockingActorIds.length ||
    left.blockingActorIds.some(
      (actorId, index) => actorId !== right.blockingActorIds[index],
    )
  ) {
    throw new Error(
      "GPU Flow committed surface frame has stale display completeness.",
    );
  }
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

function getGpuFlowCommittedSurfaceActorScrollRevision({
  retainedRuntimeFrame,
  surfaceId,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly surfaceId: string;
}): number {
  return (
    retainedRuntimeFrame.input.scrollRevisions.get(surfaceId) ??
    retainedRuntimeFrame.input.scrollRevision
  );
}

function freezeActor(
  actor: GpuFlowCommittedSurfaceActorGenerationInput,
): GpuFlowCommittedSurfaceActorGeneration {
  const visualGenerationId =
    actor.visualGenerationId ?? actor.contentGenerationId;
  const semanticGenerationId =
    actor.semanticGenerationId ?? actor.contentGenerationId;
  return Object.freeze({
    ...actor,
    accessibilityProjection: actor.accessibilityProjection ?? "none",
    activationPolicy: actor.activationPolicy ?? "none",
    actorFamily: actor.actorFamily ?? actor.kind,
    clipRect: freezeRect(actor.clipRect),
    flowRect: freezeRect(actor.flowRect),
    retainedScrollOffset: actor.retainedScrollOffset
      ? Object.freeze({ ...actor.retainedScrollOffset })
      : null,
    semanticGenerationId,
    sourceRect: freezeRect(actor.sourceRect),
    textCoverageProof: actor.textCoverageProof
      ? Object.freeze({ ...actor.textCoverageProof })
      : null,
    textSnapshotCacheKeyRevision: actor.textSnapshotCacheKeyRevision ?? null,
    visualGenerationId,
  });
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

function rectKey(rect: GpuRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function colorKey(color: HtmlSurfaceSolidRoundedRectVisual["color"]): string {
  return `${color.r},${color.g},${color.b},${color.a}`;
}
