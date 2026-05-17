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

export type GpuFlowCommittedSurfaceActorKind =
  | "retained-page"
  | "dom-control"
  | "dom-island"
  | "html-texture"
  | "gpu-native-visual";

export type GpuFlowCommittedSurfaceActorGeneration = {
  readonly active: boolean;
  readonly actorId: string;
  readonly clipChainRevision: string;
  readonly clipRect: GpuRect;
  readonly controlId: string | null;
  readonly focusIdentity: string | null;
  readonly flowRect: GpuRect;
  readonly generationId: string;
  readonly islandId: string | null;
  readonly kind: GpuFlowCommittedSurfaceActorKind;
  readonly mountReadiness: "not-required" | "ready";
  readonly ownerSurfaceId: string;
  readonly pointerEvents: "auto" | "none";
  readonly projectionReadiness: "not-required" | "ready";
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

export type GpuFlowCommittedSurfaceCompleteness = {
  readonly blockingActorIds: readonly string[];
  readonly projectedVisibleNonemptyDomControlCount: number;
  readonly status: "blocked" | "complete" | "startup";
  readonly visibleNonemptyDomControlCount: number;
};

export type GpuFlowCommittedSurfaceCoherence = {
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
      retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
      surfaces: retainedDisplayFrame.flatSurfaces,
    }),
    ...createDomControlActors(retainedRuntimeFrame),
    ...createDomIslandActors(retainedRuntimeFrame),
    ...createGpuNativeVisualActors({
      retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
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
      retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
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
      actor.generationId,
      actor.clipChainRevision,
    ]),
    retainedScrollRevision: frame.coherence.retainedScrollRevision,
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
          controlId: null,
          focusIdentity: null,
          flowRect: generation.flowRect,
          generationId: generation.generationId,
          islandId: null,
          kind: "retained-page",
          mountReadiness: "not-required",
          ownerSurfaceId: actor.surfaceId,
          pointerEvents: "none",
          projectionReadiness: "not-required",
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
  retainedScrollRevision,
  surfaces,
}: {
  readonly retainedScrollRevision: number;
  readonly surfaces: readonly HtmlSurfaceFlatVisual[];
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    surfaces.map((surface, index) =>
      htmlTextureToActor({
        index,
        retainedScrollRevision,
        surface,
      }),
    ),
  );
}

function htmlTextureToActor({
  index,
  retainedScrollRevision,
  surface,
}: {
  readonly index: number;
  readonly retainedScrollRevision: number;
  readonly surface: HtmlSurfaceFlatVisual;
}): GpuFlowCommittedSurfaceActorGeneration {
  const flowRect = {
    height: surface.height,
    width: surface.width,
    x: surface.x,
    y: surface.y,
  };
  const sourceRect = getHtmlTextureSourceRect(surface);
  return freezeActor({
    active: false,
    actorId: `${surface.surfaceId}:html-texture:${index}`,
    clipChainRevision: surface.surfaceId,
    clipRect: flowRect,
    controlId: null,
    focusIdentity: null,
    flowRect,
    generationId: [
      "html-texture",
      surface.surfaceId,
      index,
      surface.texture.textureContentKey ?? "content:unknown",
      surface.texture.zoomBucket,
      rectKey(flowRect),
      rectKey(sourceRect),
      retainedScrollRevision,
    ].join("|"),
    islandId: null,
    kind: "html-texture",
    mountReadiness: "not-required",
    ownerSurfaceId: surface.surfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
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
      domControlToActor({
        control,
        retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
      }),
    ),
  );
}

function domControlToActor({
  control,
  retainedScrollRevision,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly retainedScrollRevision: number;
}): GpuFlowCommittedSurfaceActorGeneration {
  const projected =
    control.clipRectSurfaceCssPx.width > 0 &&
    control.clipRectSurfaceCssPx.height > 0;
  return freezeActor({
    active: control.active,
    actorId: control.sourceId,
    clipChainRevision: control.clipChainRevision,
    clipRect: control.sectionClipRectFlowPx,
    controlId: control.controlId,
    focusIdentity: control.active ? control.sourceId : null,
    flowRect: control.worldRectFlowPx,
    generationId: [
      "dom-control",
      control.sourceId,
      control.sourceKey,
      control.valueStyleRevision,
      control.lifecycleState,
      control.clipChainRevision,
      retainedScrollRevision,
    ].join("|"),
    islandId: null,
    kind: "dom-control",
    mountReadiness: projected ? "ready" : "not-required",
    ownerSurfaceId: control.surfaceId,
    pointerEvents: projected ? "auto" : "none",
    projectionReadiness: projected ? "ready" : "not-required",
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
        retainedScrollRevision: retainedRuntimeFrame.input.scrollRevision,
      }),
    ),
  );
}

function domIslandToActor({
  island,
  retainedScrollRevision,
}: {
  readonly island: GpuDomIsland;
  readonly retainedScrollRevision: number;
}): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor({
    active: true,
    actorId: island.id,
    clipChainRevision: island.clipOwnerId,
    clipRect: island.rect,
    controlId: null,
    focusIdentity: island.id,
    flowRect: island.rect,
    generationId: [
      "dom-island",
      island.id,
      island.clipOwnerId,
      rectKey(island.rect),
      retainedScrollRevision,
    ].join("|"),
    islandId: island.id,
    kind: "dom-island",
    mountReadiness: "ready",
    ownerSurfaceId: island.clipOwnerId,
    pointerEvents: "auto",
    projectionReadiness: "ready",
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
  retainedScrollRevision,
  visuals,
}: {
  readonly retainedScrollRevision: number;
  readonly visuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    visuals.map((visual, index) =>
      gpuNativeVisualToActor({
        index,
        retainedScrollRevision,
        visual,
      }),
    ),
  );
}

function gpuNativeVisualToActor({
  index,
  retainedScrollRevision,
  visual,
}: {
  readonly index: number;
  readonly retainedScrollRevision: number;
  readonly visual: HtmlSurfaceSolidRoundedRectVisual;
}): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor({
    active: false,
    actorId: `${visual.surfaceId}:native-visual:${index}`,
    clipChainRevision: visual.surfaceId,
    clipRect: visual.rect,
    controlId: null,
    focusIdentity: null,
    flowRect: visual.rect,
    generationId: [
      "gpu-native-visual",
      visual.surfaceId,
      index,
      rectKey(visual.rect),
      visual.radius,
      colorKey(visual.color),
      retainedScrollRevision,
    ].join("|"),
    islandId: null,
    kind: "gpu-native-visual",
    mountReadiness: "not-required",
    ownerSurfaceId: visual.surfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
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
    retainedRuntimeFrame.input.scrollRevision,
    ...actorGenerations.map((actor) => actor.clipChainRevision),
  ].join("|");
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
