import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
  type GpuRetainedContentSurface,
} from "../GpuRetainedContentSurfaces";
import { createGpuRetainedContentRowControlRect } from "../retainedContentRowLayout";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "../retainedContentScene";
import {
  getGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "../retainedContentSceneSourceMetadata";
import type { GpuRetainedContentRow } from "../retainedContentSceneTypes";
import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
  type GpuRetainedDomControlVisualSemantics,
  type GpuRetainedTextSnapshotCacheKey,
} from "../retainedDomControlScene";
import type { GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  rectsIntersect,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";

type GpuRetainedTextLikeDomControlRow = GpuRetainedContentRow & {
  readonly control: Extract<
    NonNullable<GpuRetainedContentRow["control"]>,
    { readonly kind: "text-like" }
  >;
};

type GpuRetainedDomControlViewportSize = {
  readonly height: number;
  readonly width: number;
};

type GpuRetainedDomControlSourceOptions = {
  readonly devicePixelRatioBucket?: number | undefined;
  readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
  readonly viewport?: GpuViewportInput | undefined;
  readonly viewportSize?: GpuRetainedDomControlViewportSize | undefined;
  readonly viewportZoomBucket?: number | undefined;
  readonly scrollRevision?: number | undefined;
};

const GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX = 720;
const GPU_RETAINED_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX = 8;
const GPU_RETAINED_DOM_CONTROL_MAX_OVERSCAN_LIVE_ACTORS = 8;
const GPU_RETAINED_DOM_CONTROL_MAX_READABLE_LIVE_ACTORS = 24;
const GPU_RETAINED_DOM_CONTROL_MAX_SNAPSHOT_ACTORS = 64;
const GPU_RETAINED_DOM_CONTROL_SMALL_SCENE_LIVE_LIMIT = 64;
const GPU_RETAINED_DOM_CONTROL_MAX_LIVE_ACTORS = 32;

export function getGpuRetainedDomControlSources(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  assertGpuRetainedDomControlSceneOnlyAccessAllowed();
  return getGpuRetainedDomControlSourcesFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces),
  );
}

function assertGpuRetainedDomControlSceneOnlyAccessAllowed() {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  throw new Error(
    "Retained DOM-control sources must be read from a sampled retained runtime frame.",
  );
}

export function getGpuRetainedDomControlSourcesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
  options: GpuRetainedDomControlSourceOptions = {},
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return applyGpuRetainedDomControlVisualPolicies(
    surfaces.flatMap((surface) =>
      getGpuRetainedDomControlSourcesForSurface(surface, options),
    ),
    options,
  );
}

export function getGpuRetainedDomControlSourcesFromHitTestSurfaces(
  surfaces: readonly GpuRetainedContentSurface[],
  options: GpuRetainedDomControlSourceOptions = {},
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return applyGpuRetainedDomControlVisualPolicies(
    surfaces.flatMap((surface) =>
      getGpuRetainedDomControlSourcesForHitTestSurface(surface, options),
    ),
    options,
  );
}

function getGpuRetainedDomControlSourcesForHitTestSurface(
  surface: GpuRetainedContentSurface,
  options: GpuRetainedDomControlSourceOptions,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceInput) {
    return [];
  }
  const sectionClipRectFlowPx = intersectGpuRetainedDomControlRects(
    surface.rect,
    surface.clipRect,
  );
  if (sectionClipRectFlowPx.width <= 0 || sectionClipRectFlowPx.height <= 0) {
    return [];
  }
  const sectionClipRectSurfaceCssPx = {
    height: sectionClipRectFlowPx.height,
    width: sectionClipRectFlowPx.width,
    x: sectionClipRectFlowPx.x - surface.rect.x,
    y: sectionClipRectFlowPx.y - surface.rect.y,
  };
  const sources: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const row of surface.retainedScene.rows) {
    if (!isGpuRetainedTextLikeDomControlRow(row)) {
      continue;
    }
    const controlRectSurfaceCssPx = createGpuRetainedContentRowControlRect({
      controlWidth: sourceInput.controlWidth,
      indentWidth: sourceInput.indentWidth,
      rightInset: sourceInput.controlRightInset,
      rowDepth: row.depth,
      rowRect: row.projectedRect,
    });
    const clipRectSurfaceCssPx = intersectGpuRetainedDomControlRects(
      controlRectSurfaceCssPx,
      sectionClipRectSurfaceCssPx,
    );
    if (clipRectSurfaceCssPx.width <= 0 || clipRectSurfaceCssPx.height <= 0) {
      continue;
    }
    const source = createGpuRetainedDomControlSourceBase({
      active: Boolean(row.state.nativeControlActive),
      clipRectSurfaceCssPx,
      controlRectSurfaceCssPx,
      liveControlRectSurfaceCssPx: controlRectSurfaceCssPx,
      liveRow: row,
      options,
      row,
      sectionClipRectFlowPx,
      sectionScrollOffset: surface.retainedScene.scrollOffset,
      surface,
    });
    sources.push({
      ...source,
      sourceKey: createGpuRetainedDomControlSourceKey(source),
    });
  }
  return sources;
}

function getGpuRetainedDomControlSourcesForSurface(
  surface: GpuRetainedContentSourceSurface,
  options: GpuRetainedDomControlSourceOptions,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  const rasterScene = createGpuRetainedRowContentSceneWithScrollWindow({
    scene: surface.retainedScene,
    scrollOffset: surface.textureWindow.cacheScrollOffset,
    viewportRect: surface.textureWindow.cacheViewportRect,
  });
  const sourceInput = getGpuRetainedContentSceneSourceInput(rasterScene);
  const liveSourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceInput || !liveSourceInput) {
    return [];
  }
  const textureBounds = {
    height: surface.textureWindow.textureHeight,
    width: surface.textureWindow.textureWidth,
    x: 0,
    y: 0,
  };
  const liveRowsById = new Map(
    surface.retainedScene.rows.map((row) => [row.id, row]),
  );
  const sources: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const row of rasterScene.rows) {
    const source = createGpuRetainedDomControlSourceForRow({
      liveRowsById,
      liveSourceInput,
      options,
      row,
      sourceInput,
      surface,
      textureBounds,
    });
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

function createGpuRetainedDomControlSourceForRow({
  liveRowsById,
  liveSourceInput,
  options,
  row,
  sourceInput,
  surface,
  textureBounds,
}: {
  readonly liveRowsById: ReadonlyMap<string, GpuRetainedContentRow>;
  readonly liveSourceInput: GpuRetainedContentSceneSourceInput;
  readonly options: GpuRetainedDomControlSourceOptions;
  readonly row: GpuRetainedContentRow;
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly textureBounds: GpuRect;
}): GpuRetainedDomControlSourceDescriptor | null {
  if (!isGpuRetainedTextLikeDomControlRow(row)) {
    return null;
  }
  const controlRectSurfaceCssPx = createGpuRetainedContentRowControlRect({
    controlWidth: sourceInput.controlWidth,
    indentWidth: sourceInput.indentWidth,
    rightInset: sourceInput.controlRightInset,
    rowDepth: row.depth,
    rowRect: row.projectedRect,
  });
  const clipRectSurfaceCssPx = intersectGpuRetainedDomControlRects(
    controlRectSurfaceCssPx,
    textureBounds,
  );
  if (clipRectSurfaceCssPx.width <= 0 || clipRectSurfaceCssPx.height <= 0) {
    return null;
  }
  const liveRow = liveRowsById.get(row.id) ?? row;
  const liveControlRectSurfaceCssPx = getGpuRetainedDomControlLiveRect({
    fallbackRect: controlRectSurfaceCssPx,
    liveRow,
    liveSourceInput,
  });
  const active = Boolean(liveRow.state.nativeControlActive);
  const source = createGpuRetainedDomControlSourceBase({
    active,
    clipRectSurfaceCssPx,
    controlRectSurfaceCssPx,
    liveControlRectSurfaceCssPx,
    liveRow,
    options,
    row,
    sectionClipRectFlowPx: intersectGpuRetainedDomControlRects(
      surface.rect,
      surface.clipRect,
    ),
    sectionScrollOffset: surface.textureWindow.cacheScrollOffset,
    surface,
  });
  return {
    ...source,
    sourceKey: createGpuRetainedDomControlSourceKey(source),
  };
}

function isGpuRetainedTextLikeDomControlRow(
  row: GpuRetainedContentRow,
): row is GpuRetainedTextLikeDomControlRow {
  return (
    row.control?.kind === "text-like" && row.control.renderOwner === "dom-owned"
  );
}

function getGpuRetainedDomControlLiveRect({
  fallbackRect,
  liveRow,
  liveSourceInput,
}: {
  readonly fallbackRect: GpuRect;
  readonly liveRow: GpuRetainedContentRow;
  readonly liveSourceInput: GpuRetainedContentSceneSourceInput;
}): GpuRect {
  if (liveRow.control?.kind !== "text-like") {
    return fallbackRect;
  }
  return createGpuRetainedContentRowControlRect({
    controlWidth: liveSourceInput.controlWidth,
    indentWidth: liveSourceInput.indentWidth,
    rightInset: liveSourceInput.controlRightInset,
    rowDepth: liveRow.depth,
    rowRect: liveRow.projectedRect,
  });
}

function createGpuRetainedDomControlSourceBase({
  active,
  clipRectSurfaceCssPx,
  controlRectSurfaceCssPx,
  liveControlRectSurfaceCssPx,
  liveRow,
  options,
  row,
  sectionClipRectFlowPx,
  sectionScrollOffset,
  surface,
}: {
  readonly active: boolean;
  readonly clipRectSurfaceCssPx: GpuRect;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly liveControlRectSurfaceCssPx: GpuRect;
  readonly liveRow: GpuRetainedContentRow;
  readonly options: GpuRetainedDomControlSourceOptions;
  readonly row: GpuRetainedTextLikeDomControlRow;
  readonly sectionClipRectFlowPx: GpuRect;
  readonly sectionScrollOffset: { readonly x: number; readonly y: number };
  readonly surface: GpuRetainedContentSurface;
}): Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey"> {
  const sourceId = getGpuRetainedDomControlSourceId({
    rowId: row.id,
    surfaceId: surface.id,
  });
  const sourceRectCssPx = {
    height: controlRectSurfaceCssPx.height,
    width: controlRectSurfaceCssPx.width,
    x: 0,
    y: 0,
  };
  const worldRectFlowPx = {
    height: liveControlRectSurfaceCssPx.height,
    width: liveControlRectSurfaceCssPx.width,
    x: surface.rect.x + liveControlRectSurfaceCssPx.x,
    y: surface.rect.y + liveControlRectSurfaceCssPx.y,
  };
  const viewportRectCssPx = toViewportRectCssPx({
    rect: worldRectFlowPx,
    viewport: options.viewport,
  });
  const valueStyleKey = createGpuRetainedDomControlValueStyleKey({
    control: row.control,
    controlRectSurfaceCssPx,
    disabled: row.state.disabled,
    error: row.state.error,
  });
  const snapshotCacheKey = createGpuRetainedDomControlSnapshotCacheKey({
    control: row.control,
    controlRectSurfaceCssPx,
    defaultValue: row.control.defaultDisplayValue,
    devicePixelRatioBucket: options.devicePixelRatioBucket ?? 1,
    disabled: row.state.disabled,
    error: row.state.error,
    value: row.control.displayValue,
    valueStyleKey,
    viewportZoomBucket: options.viewportZoomBucket ?? 1,
  });
  return {
    active,
    ...createGpuRetainedDomControlActivationField({ active, liveRow }),
    clipRectSurfaceCssPx,
    clipChainRevision: JSON.stringify({
      clipRectSurfaceCssPx,
      sectionClipRectFlowPx,
      surfaceId: surface.id,
    }),
    controlId: sourceId,
    controlRectSurfaceCssPx,
    defaultValue: row.control.defaultDisplayValue,
    disabled: row.state.disabled,
    editorKind: row.control.editorKind,
    error: row.state.error,
    geometryRevision: JSON.stringify({
      controlRectSurfaceCssPx,
      sectionClipRectFlowPx,
      worldRectFlowPx,
    }),
    interactionPolicy: GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
    language: row.control.policy.language,
    layerSlot: getGpuRetainedDomControlLayerSlot(active),
    lifecycleState: getGpuRetainedDomControlLifecycleState(active),
    linePolicy: row.control.policy.linePolicy,
    maxVisibleLines: row.control.policy.maxVisibleLines,
    minVisibleLines: row.control.policy.minVisibleLines,
    rendererFamily: row.control.rendererFamily,
    role: "text-like",
    rowId: row.id,
    sectionClipRectFlowPx,
    sectionId: surface.ownerSectionId,
    sectionScrollOffset,
    sectionScrollRevision: getGpuRetainedDomControlSectionScrollRevision({
      options,
      surfaceId: surface.id,
    }),
    sourceId,
    sourceRectCssPx,
    projectionVisibility: "viewport-visible",
    snapshotSurfaceId: null,
    snapshotCacheKey,
    snapshotCacheKeyRevision: JSON.stringify(snapshotCacheKey),
    surfaceId: surface.id,
    value: row.control.displayValue,
    valueStyleKey,
    valueStyleRevision: valueStyleKey,
    viewportRectCssPx,
    viewportSampleRevision: createGpuRetainedDomControlViewportSampleRevision({
      options,
      viewportRectCssPx,
    }),
    visualPolicy: "live-dom",
    visualSemantics: createGpuRetainedDomControlVisualSemantics(active),
    worldRectFlowPx,
    wrapLines: row.control.policy.wrapLines,
    zOrder: surface.zIndex + 1,
  };
}

function getGpuRetainedDomControlSourceId({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): string {
  return `retained-dom-control:${surfaceId}:${rowId}`;
}

function createGpuRetainedDomControlActivationField({
  active,
  liveRow,
}: {
  readonly active: boolean;
  readonly liveRow: GpuRetainedContentRow;
}): Pick<GpuRetainedDomControlSourceDescriptor, "activation"> | object {
  if (!active || !liveRow.state.domControlActivation) {
    return {};
  }
  return { activation: liveRow.state.domControlActivation };
}

function getGpuRetainedDomControlLayerSlot(
  active: boolean,
): GpuRetainedDomControlSourceDescriptor["layerSlot"] {
  return active ? "active-dom-control-plane" : "dom-control-plane";
}

function getGpuRetainedDomControlLifecycleState(
  active: boolean,
): GpuRetainedDomControlSourceDescriptor["lifecycleState"] {
  return active ? "active-projected" : "passive-projected";
}

function getGpuRetainedDomControlSectionScrollRevision({
  options,
  surfaceId,
}: {
  readonly options: GpuRetainedDomControlSourceOptions;
  readonly surfaceId: string;
}): number {
  return options.scrollRevisions?.get(surfaceId) ?? options.scrollRevision ?? 0;
}

function createGpuRetainedDomControlViewportSampleRevision({
  options,
  viewportRectCssPx,
}: {
  readonly options: GpuRetainedDomControlSourceOptions;
  readonly viewportRectCssPx: GpuRect;
}): string {
  return JSON.stringify({
    viewport: options.viewport ?? [0, 0, 1],
    viewportRectCssPx,
  });
}

export function getGpuRetainedDomControlSnapshotSurfaceId(
  control: Pick<GpuRetainedDomControlSourceDescriptor, "sourceId">,
): string {
  return `retained-dom-control-snapshot:${control.sourceId}`;
}

function applyGpuRetainedDomControlVisualPolicies(
  sources: readonly GpuRetainedDomControlSourceDescriptor[],
  options: GpuRetainedDomControlSourceOptions,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  if (sources.length === 0) {
    return sources;
  }
  if (!options.viewportSize) {
    return applyDefaultGpuRetainedDomControlVisualPolicies(sources);
  }
  const optionsWithViewportSize = {
    ...options,
    viewportSize: options.viewportSize,
  };
  const candidates = createGpuRetainedDomControlVisualCandidates({
    options: optionsWithViewportSize,
    sources,
  });
  const candidateBySourceId = new Map(
    candidates.map((candidate) => [candidate.control.sourceId, candidate]),
  );
  const liveSourceIds = createGpuRetainedDomControlLiveSourceIds({
    candidates,
    sourceCount: sources.length,
    sources,
  });
  const snapshotSourceIds = createGpuRetainedDomControlSnapshotSourceIds({
    candidates,
    liveSourceIds,
  });

  return sources.map((source) =>
    applyGpuRetainedDomControlVisualPolicy({
      candidate: candidateBySourceId.get(source.sourceId),
      liveSourceIds,
      snapshotSourceIds,
      source,
    }),
  );
}

function applyDefaultGpuRetainedDomControlVisualPolicies(
  sources: readonly GpuRetainedDomControlSourceDescriptor[],
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return sources.map((source) => {
    const hasClip = hasGpuRetainedDomControlClip(source);
    return withGpuRetainedDomControlVisualPolicy(source, {
      projectionVisibility: hasClip ? "viewport-visible" : "clipped-empty",
      snapshotSurfaceId: null,
      visualPolicy: hasClip ? "live-dom" : "clipped-empty",
    });
  });
}

type GpuRetainedDomControlVisualCandidate = {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly distanceToViewportCenter: number;
  readonly readableAtViewport: boolean;
  readonly visibleAtViewport: boolean;
};

function createGpuRetainedDomControlVisualCandidates({
  options,
  sources,
}: {
  readonly options: GpuRetainedDomControlSourceOptions & {
    readonly viewportSize: GpuRetainedDomControlViewportSize;
  };
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}): readonly GpuRetainedDomControlVisualCandidate[] {
  const viewport = normalizeGpuViewport(options.viewport ?? [0, 0, 1]);
  const viewportFlowRect = getVisibleFlowRect({
    canvasHeight: options.viewportSize.height,
    canvasWidth: options.viewportSize.width,
    viewport,
  });
  const overscanFlowRect = getVisibleFlowRect({
    canvasHeight: options.viewportSize.height,
    canvasWidth: options.viewportSize.width,
    marginCssPx: GPU_RETAINED_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX,
    viewport,
  });
  return sources
    .map((control) =>
      createGpuRetainedDomControlVisualCandidate({
        control,
        overscanFlowRect,
        viewport,
        viewportFlowRect,
      }),
    )
    .filter((candidate) => candidate !== null);
}

function createGpuRetainedDomControlLiveSourceIds({
  candidates,
  sourceCount,
  sources,
}: {
  readonly candidates: readonly GpuRetainedDomControlVisualCandidate[];
  readonly sourceCount: number;
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}): ReadonlySet<string> {
  const liveSourceIds = new Set<string>(
    sources
      .filter((control) => control.active)
      .map((control) => control.sourceId),
  );
  if (sourceCount <= GPU_RETAINED_DOM_CONTROL_SMALL_SCENE_LIVE_LIMIT) {
    addGpuRetainedDomControlCandidateSourceIds(liveSourceIds, candidates);
    return liveSourceIds;
  }
  const inactiveCandidates = candidates.filter(
    (candidate) => !candidate.control.active,
  );
  const inactiveLiveBudget = Math.max(0, GPU_RETAINED_DOM_CONTROL_MAX_LIVE_ACTORS - liveSourceIds.size);
  const readableLiveBudget = Math.min(
    GPU_RETAINED_DOM_CONTROL_MAX_READABLE_LIVE_ACTORS,
    inactiveLiveBudget,
  );
  addGpuRetainedDomControlCandidateSourceIds(
    liveSourceIds,
    inactiveCandidates
      .filter((candidate) => candidate.readableAtViewport)
      .sort(compareGpuRetainedDomControlVisualCandidates)
      .slice(0, readableLiveBudget),
  );
  const overscanLiveBudget = Math.min(
    GPU_RETAINED_DOM_CONTROL_MAX_OVERSCAN_LIVE_ACTORS,
    Math.max(0, GPU_RETAINED_DOM_CONTROL_MAX_LIVE_ACTORS - liveSourceIds.size),
  );
  addGpuRetainedDomControlCandidateSourceIds(
    liveSourceIds,
    inactiveCandidates
      .filter(
        (candidate) =>
          !candidate.readableAtViewport &&
          !liveSourceIds.has(candidate.control.sourceId),
      )
      .sort(compareGpuRetainedDomControlVisualCandidates)
      .slice(0, overscanLiveBudget),
  );
  return liveSourceIds;
}

function addGpuRetainedDomControlCandidateSourceIds(
  sourceIds: Set<string>,
  candidates: readonly GpuRetainedDomControlVisualCandidate[],
): void {
  for (const candidate of candidates) {
    sourceIds.add(candidate.control.sourceId);
  }
}

function createGpuRetainedDomControlSnapshotSourceIds({
  candidates,
  liveSourceIds,
}: {
  readonly candidates: readonly GpuRetainedDomControlVisualCandidate[];
  readonly liveSourceIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  return new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.visibleAtViewport &&
          !candidate.control.active &&
          !liveSourceIds.has(candidate.control.sourceId),
      )
      .sort(compareGpuRetainedDomControlVisualCandidates)
      .slice(0, GPU_RETAINED_DOM_CONTROL_MAX_SNAPSHOT_ACTORS)
      .map((candidate) => candidate.control.sourceId),
  );
}

function applyGpuRetainedDomControlVisualPolicy({
  candidate,
  liveSourceIds,
  snapshotSourceIds,
  source,
}: {
  readonly candidate: GpuRetainedDomControlVisualCandidate | undefined;
  readonly liveSourceIds: ReadonlySet<string>;
  readonly snapshotSourceIds: ReadonlySet<string>;
  readonly source: GpuRetainedDomControlSourceDescriptor;
}): GpuRetainedDomControlSourceDescriptor {
  if (!hasGpuRetainedDomControlClip(source)) {
    return withGpuRetainedDomControlVisualPolicy(source, {
      projectionVisibility: "clipped-empty",
      snapshotSurfaceId: null,
      visualPolicy: "clipped-empty",
    });
  }
  if (liveSourceIds.has(source.sourceId)) {
    return withGpuRetainedDomControlVisualPolicy(source, {
      projectionVisibility:
        resolveGpuRetainedDomControlLiveVisibility(candidate),
      snapshotSurfaceId: null,
      visualPolicy: "live-dom",
    });
  }
  if (snapshotSourceIds.has(source.sourceId)) {
    return withGpuRetainedDomControlVisualPolicy(source, {
      projectionVisibility: "viewport-visible",
      snapshotSurfaceId: getGpuRetainedDomControlSnapshotSurfaceId(source),
      visualPolicy: "snapshot",
    });
  }
  if (candidate?.visibleAtViewport) {
    return withGpuRetainedDomControlVisualPolicy(source, {
      projectionVisibility: "viewport-visible",
      snapshotSurfaceId: null,
      visualPolicy: "blocked-awaiting-browser-visual",
    });
  }
  return withGpuRetainedDomControlVisualPolicy(source, {
    projectionVisibility: candidate ? "overscan-visible" : "outside-viewport",
    snapshotSurfaceId: null,
    visualPolicy: "outside-viewport",
  });
}

function resolveGpuRetainedDomControlLiveVisibility(
  candidate: GpuRetainedDomControlVisualCandidate | undefined,
): GpuRetainedDomControlSourceDescriptor["projectionVisibility"] {
  if (!candidate) {
    return "outside-viewport";
  }
  return candidate.visibleAtViewport ? "viewport-visible" : "overscan-visible";
}

function createGpuRetainedDomControlVisualCandidate({
  control,
  overscanFlowRect,
  viewport,
  viewportFlowRect,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly overscanFlowRect: GpuRect;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
  readonly viewportFlowRect: GpuRect;
}): GpuRetainedDomControlVisualCandidate | null {
  const visibleClipFlowPx = getGpuRetainedDomControlVisibleClipFlowPx(control);
  if (
    visibleClipFlowPx.width <= 0 ||
    visibleClipFlowPx.height <= 0 ||
    !rectsIntersect(overscanFlowRect, visibleClipFlowPx)
  ) {
    return null;
  }
  const visibleAtViewport =
    rectsIntersect(viewportFlowRect, visibleClipFlowPx) &&
    isGpuRetainedDomControlReadableAtViewport({
      control,
      viewport,
      visibleClipFlowPx,
    });
  return {
    control,
    distanceToViewportCenter: getGpuRetainedDomControlDistanceToCenter({
      control,
      visibleFlowRect: viewportFlowRect,
    }),
    readableAtViewport: visibleAtViewport,
    visibleAtViewport,
  };
}

function isGpuRetainedDomControlReadableAtViewport({
  control,
  viewport,
  visibleClipFlowPx,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
  readonly visibleClipFlowPx: GpuRect;
}): boolean {
  return (
    control.active ||
    visibleClipFlowPx.height * viewport.zoom >=
      GPU_RETAINED_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX
  );
}

function getGpuRetainedDomControlDistanceToCenter({
  control,
  visibleFlowRect,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly visibleFlowRect: GpuRect;
}): number {
  const controlCenterX =
    control.worldRectFlowPx.x + control.worldRectFlowPx.width / 2;
  const controlCenterY =
    control.worldRectFlowPx.y + control.worldRectFlowPx.height / 2;
  const viewportCenterX = visibleFlowRect.x + visibleFlowRect.width / 2;
  const viewportCenterY = visibleFlowRect.y + visibleFlowRect.height / 2;
  return Math.hypot(
    controlCenterX - viewportCenterX,
    controlCenterY - viewportCenterY,
  );
}

function compareGpuRetainedDomControlVisualCandidates(
  left: GpuRetainedDomControlVisualCandidate,
  right: GpuRetainedDomControlVisualCandidate,
): number {
  return (
    left.distanceToViewportCenter - right.distanceToViewportCenter ||
    compareGpuRetainedDomControlSources(left.control, right.control)
  );
}

function compareGpuRetainedDomControlSources(
  left: GpuRetainedDomControlSourceDescriptor,
  right: GpuRetainedDomControlSourceDescriptor,
): number {
  return (
    left.zOrder - right.zOrder ||
    left.surfaceId.localeCompare(right.surfaceId) ||
    left.rowId.localeCompare(right.rowId)
  );
}

function withGpuRetainedDomControlVisualPolicy(
  source: GpuRetainedDomControlSourceDescriptor,
  policy: Pick<
    GpuRetainedDomControlSourceDescriptor,
    "projectionVisibility" | "snapshotSurfaceId" | "visualPolicy"
  >,
): GpuRetainedDomControlSourceDescriptor {
  if (
    source.projectionVisibility === policy.projectionVisibility &&
    source.snapshotSurfaceId === policy.snapshotSurfaceId &&
    source.visualPolicy === policy.visualPolicy
  ) {
    return source;
  }
  return {
    ...source,
    ...policy,
  };
}

function hasGpuRetainedDomControlClip(
  control: Pick<GpuRetainedDomControlSourceDescriptor, "clipRectSurfaceCssPx">,
): boolean {
  return (
    control.clipRectSurfaceCssPx.width > 0 &&
    control.clipRectSurfaceCssPx.height > 0
  );
}

export function getGpuRetainedDomControlVisibleClipFlowPx(
  control: Pick<
    GpuRetainedDomControlSourceDescriptor,
    "sectionClipRectFlowPx" | "worldRectFlowPx"
  >,
): GpuRect {
  return intersectGpuRetainedDomControlRects(
    control.worldRectFlowPx,
    control.sectionClipRectFlowPx,
  );
}

function createGpuRetainedDomControlSourceKey(
  source: Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey">,
): string {
  return JSON.stringify({
    defaultValue: source.defaultValue,
    disabled: source.disabled,
    error: source.error,
    language: source.language,
    linePolicy: source.linePolicy,
    rowId: source.rowId,
    sourceHeight: source.sourceRectCssPx.height,
    sourceWidth: source.sourceRectCssPx.width,
    surfaceId: source.surfaceId,
    value: source.value,
    valueStyleKey: source.valueStyleKey,
    wrapLines: source.wrapLines,
  });
}

function createGpuRetainedDomControlSnapshotCacheKey({
  control,
  controlRectSurfaceCssPx,
  defaultValue,
  devicePixelRatioBucket,
  disabled,
  error,
  value,
  valueStyleKey,
  viewportZoomBucket,
}: {
  readonly control: Extract<
    NonNullable<
      GpuRetainedContentSourceSurface["retainedScene"]["rows"][number]["control"]
    >,
    { readonly kind: "text-like" }
  >;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly defaultValue: string;
  readonly devicePixelRatioBucket: number;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly value: string;
  readonly valueStyleKey: string;
  readonly viewportZoomBucket: number;
}): GpuRetainedTextSnapshotCacheKey {
  return {
    appThemeRevision: "setta-app-theme:inherited",
    codeMirrorThemeRevision: "setta-codemirror-theme:use-code-mirror-style",
    cssStyleRevision: valueStyleKey,
    defaultValue,
    devicePixelRatioBucket,
    disabled,
    editorExtensionGeneration: [
      control.editorKind,
      control.policy.linePolicy,
      control.policy.wrapLines ? "wrap" : "nowrap",
    ].join("|"),
    editorKind: control.editorKind,
    error,
    fontGeneration: "document-fonts:runtime",
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    measuredLayoutMode:
      control.policy.linePolicy === "single-line" ? "single-line" : "multiline",
    placeholder: defaultValue,
    rendererFamily: control.rendererFamily,
    sourceHeight: controlRectSurfaceCssPx.height,
    sourceWidth: controlRectSurfaceCssPx.width,
    syntaxGeneration: control.policy.language ?? "plain-text",
    value,
    wrapLines: control.policy.wrapLines,
    zoomBucket: viewportZoomBucket,
  };
}

function createGpuRetainedDomControlVisualSemantics(
  active: boolean,
): GpuRetainedDomControlVisualSemantics {
  return active
    ? {
        accessibility: "active-browser-editor",
        focusable: true,
        pointer: "active-browser-editor",
        selectable: "browser-editor",
      }
    : {
        accessibility: "visual-only-aria-hidden",
        focusable: false,
        pointer: "retained-activation-model",
        selectable: "none",
      };
}

function createGpuRetainedDomControlValueStyleKey({
  control,
  controlRectSurfaceCssPx,
  disabled,
  error,
}: {
  readonly control: Extract<
    NonNullable<
      GpuRetainedContentSourceSurface["retainedScene"]["rows"][number]["control"]
    >,
    { readonly kind: "text-like" }
  >;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly disabled: boolean;
  readonly error: boolean;
}): string {
  return JSON.stringify({
    disabled,
    editorKind: control.editorKind,
    error,
    height: controlRectSurfaceCssPx.height,
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    rendererFamily: control.rendererFamily,
    width: controlRectSurfaceCssPx.width,
    wrapLines: control.policy.wrapLines,
  });
}

function toViewportRectCssPx({
  rect,
  viewport,
}: {
  readonly rect: GpuRect;
  readonly viewport: GpuViewportInput | undefined;
}): GpuRect {
  const normalizedViewport = normalizeGpuViewport(viewport ?? [0, 0, 1]);
  const position = flowToScreenPosition(rect, normalizedViewport);
  return {
    height: rect.height * normalizedViewport.zoom,
    width: rect.width * normalizedViewport.zoom,
    x: position.x,
    y: position.y,
  };
}

function intersectGpuRetainedDomControlRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
