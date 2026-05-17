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
} from "../retainedDomControlScene";
import type { GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";

type GpuRetainedTextLikeDomControlRow = GpuRetainedContentRow & {
  readonly control: Extract<
    NonNullable<GpuRetainedContentRow["control"]>,
    { readonly kind: "text-like" }
  >;
};

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
  options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  } = {},
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return surfaces.flatMap((surface) =>
    getGpuRetainedDomControlSourcesForSurface(surface, options),
  );
}

export function getGpuRetainedDomControlSourcesFromHitTestSurfaces(
  surfaces: readonly GpuRetainedContentSurface[],
  options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  } = {},
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return surfaces.flatMap((surface) =>
    getGpuRetainedDomControlSourcesForHitTestSurface(surface, options),
  );
}

function getGpuRetainedDomControlSourcesForHitTestSurface(
  surface: GpuRetainedContentSurface,
  options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  },
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
  options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  },
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
  readonly options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  };
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
  readonly options: {
    readonly scrollRevisions?: ReadonlyMap<string, number> | undefined;
    readonly viewport?: GpuViewportInput | undefined;
    readonly scrollRevision?: number | undefined;
  };
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
  return {
    active,
    ...(active && liveRow.state.domControlActivation
      ? { activation: liveRow.state.domControlActivation }
      : {}),
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
    layerSlot: active ? "active-dom-control-plane" : "dom-control-plane",
    lifecycleState: active ? "active-projected" : "passive-projected",
    linePolicy: row.control.policy.linePolicy,
    maxVisibleLines: row.control.policy.maxVisibleLines,
    minVisibleLines: row.control.policy.minVisibleLines,
    rendererFamily: row.control.rendererFamily,
    role: "text-like",
    rowId: row.id,
    sectionClipRectFlowPx,
    sectionId: surface.ownerSectionId,
    sectionScrollOffset,
    sectionScrollRevision:
      options.scrollRevisions?.get(surface.id) ?? options.scrollRevision ?? 0,
    sourceId,
    sourceRectCssPx,
    surfaceId: surface.id,
    value: row.control.displayValue,
    valueStyleKey,
    valueStyleRevision: valueStyleKey,
    viewportRectCssPx,
    viewportSampleRevision: JSON.stringify({
      viewport: options.viewport ?? [0, 0, 1],
      viewportRectCssPx,
    }),
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
