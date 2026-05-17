import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import type { RetainedDisplayFrame } from "./retainedDisplayFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
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

type GpuFlowCommittedSurfaceActorGeneration = {
  readonly active: boolean;
  readonly actorId: string;
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
  readonly sourceRect: GpuRect;
  readonly valueStyleRevision: string | null;
  readonly visibleNonempty: boolean;
  readonly wheelPolicy:
    | "none"
    | "viewport-pan"
    | "retained-scroll-or-editor-scroll"
    | "native-page";
  readonly zOrder: number;
};

type GpuFlowCommittedSurfaceCompleteness = {
  readonly blockingActorIds: readonly string[];
  readonly projectedVisibleNonemptyDomControlCount: number;
  readonly status: "blocked" | "complete" | "startup";
  readonly visibleNonemptyDomControlCount: number;
};

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
    readonly transactionOutcome: string;
  };
  readonly displayCompleteness: GpuFlowCommittedSurfaceCompleteness;
  readonly displayFrameId: number;
  readonly id: number;
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
      transactionOutcome,
    }),
    displayCompleteness,
    displayFrameId,
    id: displayFrameId,
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

function createDomControlActors(
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
  const projected =
    control.clipRectSurfaceCssPx.width > 0 &&
    control.clipRectSurfaceCssPx.height > 0;
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
  const readinessGenerationId = [
    "dom-control-readiness",
    control.sourceId,
    control.lifecycleState,
    projected ? "projected" : "clipped",
  ].join("|");
  return freezeActor({
    active: control.active,
    actorId: control.sourceId,
    clipChainRevision: control.clipChainRevision,
    clipRect: control.sectionClipRectFlowPx,
    contentGenerationId,
    controlId: control.controlId,
    focusIdentity: control.active ? control.sourceId : null,
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
    mountReadiness: projected ? "ready" : "not-required",
    ownerSurfaceId: control.surfaceId,
    pointerEvents: projected ? "auto" : "none",
    projectionReadiness: projected ? "ready" : "not-required",
    readinessGenerationId,
    retainedScrollOffset: control.sectionScrollOffset,
    retainedScrollRevision,
    rowId: control.rowId,
    sourceRect: control.sourceRectCssPx,
    valueStyleRevision: control.valueStyleRevision,
    visibleNonempty: control.value.length > 0,
    wheelPolicy: control.interactionPolicy.wheel,
    zOrder: control.zOrder,
  });
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
