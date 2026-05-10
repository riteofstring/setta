import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type { GpuRetainedContentDrawCommand } from "../retainedContentScene";
import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import type { RetainedTextLikeRowTextureFrameResult } from "../retainedTextLikeRowTextureManager";
import type { RetainedTexturePageDescriptor } from "../retainedTexturePages";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import type { GpuRetainedTextLikeRowSnapshotSource } from "./retainedTextLikeRowSnapshotSources";

let lastRetainedContentVisualStateSignature: string | null = null;
let lastRetainedTextLikeRowSnapshotSignature: string | null = null;
let lastRetainedTextLikeRowSnapshotMaintenanceSignature: string | null = null;

export function postGpuFlowRetainedContentVisualStateChromeReproEvent({
  frame,
  scene,
}: {
  readonly frame: number;
  readonly scene: GpuFlowScene | undefined;
}) {
  if (!isChromeReproActive() || !scene) {
    return;
  }
  const surfaces = scene.contentSurfaces
    .map(createGpuFlowRetainedContentSurfaceVisualState)
    .filter(
      (surface): surface is NonNullable<typeof surface> => surface !== null,
    );
  if (surfaces.length === 0) {
    return;
  }
  const signature = JSON.stringify(surfaces);
  if (signature === lastRetainedContentVisualStateSignature) {
    return;
  }
  lastRetainedContentVisualStateSignature = signature;
  postChromeReproEvent("gpu-flow-retained-content-visual-state", {
    frame,
    surfaces,
  });
}

export function postGpuFlowRetainedTextLikeRowSnapshotChromeReproEvent({
  frame,
  preparedFrame,
  rowTextureFrame,
  snapshotSources,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly rowTextureFrame: RetainedTextLikeRowTextureFrameResult;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
}) {
  if (!isChromeReproActive() || snapshotSources.length === 0) {
    return;
  }
  const state = {
    drawQuadCount: preparedFrame.drawQuadCount,
    missingPageCount: preparedFrame.missingPageCount,
    snapshotCount: snapshotSources.length,
    rowTexture: summarizeRetainedTextLikeRowTextureFrame(rowTextureFrame),
    targetDescriptors: preparedFrame.targetDescriptors
      .slice(0, 24)
      .map(summarizeRetainedTexturePageDescriptor),
    targetDescriptorCount: preparedFrame.targetDescriptors.length,
    textLikePassiveVisibility:
      createGpuFlowRetainedTextLikeRowSnapshotVisibilityState({
        preparedFrame,
        rowTextureFrame,
        snapshotSources,
      }),
  };
  const signature = JSON.stringify(state);
  if (signature === lastRetainedTextLikeRowSnapshotSignature) {
    return;
  }
  lastRetainedTextLikeRowSnapshotSignature = signature;
  postChromeReproEvent("gpu-flow-retained-text-like-row-snapshots", {
    frame,
    ...state,
  });
}

export function postGpuFlowRetainedTextLikeRowSnapshotMaintenanceChromeReproEvent({
  elementBySourceId,
  frame,
  maintenanceResult,
  rowTextureFrame,
  snapshotSources,
  viewportInteractionActive,
}: {
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly maintenanceResult: RetainedContentTexturePageMaintenanceResult;
  readonly rowTextureFrame: RetainedTextLikeRowTextureFrameResult;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly viewportInteractionActive: boolean;
}) {
  if (!isChromeReproActive() || snapshotSources.length === 0) {
    return;
  }
  const state = {
    budgetExhausted: maintenanceResult.budgetExhausted,
    diagnostics: maintenanceResult.diagnostics
      .slice(0, 16)
      .map((diagnostic) => ({
        estimate: {
          rasterMs: roundChromeReproMs(diagnostic.estimate.rasterMs),
          uploadedBytes: diagnostic.estimate.uploadedBytes,
          uploadCount: diagnostic.estimate.uploadCount,
          uploadMs: roundChromeReproMs(diagnostic.estimate.uploadMs),
        },
        item: {
          contentVersion: diagnostic.item.contentVersion,
          createdFrame: diagnostic.item.createdFrame,
          kind: diagnostic.item.kind,
          priority: diagnostic.item.priority,
          sourceRect: diagnostic.item.sourceRect
            ? roundGpuFlowChromeReproRect(diagnostic.item.sourceRect)
            : null,
          sourceWindow: diagnostic.item.sourceWindow
            ? roundGpuFlowChromeReproRect(diagnostic.item.sourceWindow)
            : null,
          surfaceId: diagnostic.item.surfaceId,
          targetLod:
            diagnostic.item.targetLod === undefined
              ? null
              : roundChromeReproMs(diagnostic.item.targetLod),
        },
        queue: diagnostic.queue,
        reason: diagnostic.reason,
      })),
    diagnosticCount: maintenanceResult.diagnostics.length,
    executedItemCount: maintenanceResult.executedItemCount,
    memory: maintenanceResult.memory,
    missingPageCount: maintenanceResult.missingPageCount,
    postMaintenanceMissingPageCount:
      maintenanceResult.postMaintenanceMissingPageCount,
    queuedWorkCount: maintenanceResult.queuedWorkCount,
    queuedWorkCountBeforeUpload: maintenanceResult.queuedWorkCountBeforeUpload,
    remainingUploadableWorkCount:
      maintenanceResult.remainingUploadableWorkCount,
    rowTexture: summarizeRetainedTextLikeRowTextureFrame(rowTextureFrame),
    rowTextureDiagnostics: rowTextureFrame.uploadDiagnostics
      .slice(0, 16)
      .map((diagnostic) => ({
        dirtyContent: diagnostic.dirtyContent,
        dirtyResolution: diagnostic.dirtyResolution,
        dirtyTileBytes: diagnostic.dirtyTileBytes,
        dirtyTileCount: diagnostic.dirtyTileCount,
        durationMs: roundChromeReproMs(diagnostic.durationMs),
        pixelHeight: diagnostic.pixelHeight,
        pixelWidth: diagnostic.pixelWidth,
        priority: diagnostic.priority,
        reasons: diagnostic.reasons,
        surfaceId: diagnostic.surfaceId,
        textureBytes: diagnostic.textureBytes,
        uploadedBytes: diagnostic.uploadedBytes,
        uploadedTextureCount: diagnostic.uploadedTextureCount,
        uploadedTileCount: diagnostic.uploadedTileCount,
      })),
    skippedItemCount: maintenanceResult.skippedItemCount,
    sourceElements: snapshotSources.slice(0, 40).map((source) =>
      summarizeGpuFlowRetainedTextLikeRowSnapshotSourceElement({
        element: elementBySourceId.get(source.sourceId) ?? null,
        source,
      }),
    ),
    sourceElementCount: snapshotSources.length,
    targetDescriptorCount: maintenanceResult.targetDescriptorCount,
    uploadedBytes: maintenanceResult.uploadedBytes,
    uploadCount: maintenanceResult.uploadCount,
    uploadMs: roundChromeReproMs(maintenanceResult.uploadMs),
    viewportInteractionActive,
  };
  const signature = JSON.stringify(state);
  if (signature === lastRetainedTextLikeRowSnapshotMaintenanceSignature) {
    return;
  }
  lastRetainedTextLikeRowSnapshotMaintenanceSignature = signature;
  postChromeReproEvent("gpu-flow-retained-text-like-row-snapshot-maintenance", {
    frame,
    ...state,
  });
}

function summarizeRetainedTextLikeRowTextureFrame(
  frame: RetainedTextLikeRowTextureFrameResult,
) {
  return {
    budgetExhausted: frame.budgetExhausted,
    clippedTextureCount: frame.clippedTextureCount,
    diagnosticCount: frame.diagnosticCount,
    evictedBytes: frame.evictedBytes,
    evictedCount: frame.evictedCount,
    flatSurfaceCount: frame.flatSurfaces.length,
    memory: {
      allocatedBytes: frame.memory.allocatedBytes,
      largestTextureBytes: frame.memory.largestTextureBytes,
      textureCount: frame.memory.textureCount,
      visibleBytes: frame.memory.visibleBytes,
      visibleTextureCount: frame.memory.visibleTextureCount,
    },
    missingElementCount: frame.missingElementCount,
    missingSurfaceCount: frame.missingSurfaceCount,
    missingTextureCount: frame.missingTextureCount,
    readyTextureCount: frame.readyTextureCount,
    registeredSourceCount: frame.registeredSourceCount,
    sourceCount: frame.sourceCount,
    staleElementCount: frame.staleElementCount,
    staleTextureCount: frame.staleTextureCount,
    uploadedBytes: frame.uploadedBytes,
    uploadCount: frame.uploadCount,
    uploadWorkSummary: {
      initialDirtySurfaceCount:
        frame.uploadWorkSummary.initialDirtySurfaceCount,
      noUploadReason: frame.uploadWorkSummary.noUploadReason,
      paintUnavailableSurfaceCount:
        frame.uploadWorkSummary.paintUnavailableSurfaceCount,
      remainingDirtySurfaceCount:
        frame.uploadWorkSummary.remainingDirtySurfaceCount,
      uploadableRemainingDirtySurfaceCount:
        frame.uploadWorkSummary.uploadableRemainingDirtySurfaceCount,
    },
    visibleSourceCount: frame.visibleSourceCount,
  };
}

function createGpuFlowRetainedTextLikeRowSnapshotVisibilityState({
  preparedFrame,
  rowTextureFrame,
  snapshotSources,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly rowTextureFrame: RetainedTextLikeRowTextureFrameResult;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
}) {
  const missingRectsBySurfaceId = groupGpuFlowCoverageRectsBySurfaceId(
    preparedFrame.refinementDescriptors.map((descriptor) => ({
      sourceRectCss: descriptor.sourceRectCss,
      surfaceId: descriptor.surfaceId,
    })),
  );
  const visualBySourceId = new Map(
    rowTextureFrame.flatSurfaces.map((visual) => [visual.surfaceId, visual]),
  );
  const visibleSourceIds = new Set(rowTextureFrame.visibleSourceIds);
  const rowCoverages = snapshotSources
    .filter((source) => visibleSourceIds.has(source.sourceId))
    .map((source) => {
      const visual = visualBySourceId.get(source.sourceId);
      const availableCoverageRatio = visual ? 1 : 0;
      const missingCoverageRatio = estimateGpuFlowRectCoverageRatio(
        source.targetRectCss,
        missingRectsBySurfaceId.get(source.surfaceId) ?? [],
      );
      const passivePixelsReady = Boolean(visual);
      return {
        availableCoverageRatio: roundGpuFlowChromeReproRatio(
          availableCoverageRatio,
        ),
        codeLength: source.code.length,
        defaultValueLength: source.defaultValue.length,
        disabled: source.disabled,
        error: source.error,
        language: source.language ?? "plain",
        linePolicy: source.linePolicy,
        missingCoverageRatio: roundGpuFlowChromeReproRatio(
          missingCoverageRatio,
        ),
        passivePixelsReady,
        rect: roundGpuFlowChromeReproRect(source.targetRectCss),
        rowId: source.rowId,
        sectionId: source.sectionId,
        sourceId: source.sourceId,
        surfaceId: source.surfaceId,
        textureContentCurrent:
          visual?.texture.textureContentKey === undefined
            ? false
            : visual.texture.textureContentKey === source.sourceKey,
        wrapLines: source.wrapLines,
      };
    });
  const problematicRows = rowCoverages.filter((row) => !row.passivePixelsReady);
  const readyRows = rowCoverages.filter((row) => row.passivePixelsReady);
  const partialRows = rowCoverages.filter(
    (row) => !row.passivePixelsReady && row.availableCoverageRatio > 0,
  );
  return {
    blankPassiveRowCount: rowCoverages.filter(
      (row) => row.availableCoverageRatio <= 0,
    ).length,
    committedPageRectCount: preparedFrame.drawQuads.length,
    missingPageRectCount: preparedFrame.refinementDescriptors.length,
    missingPassiveRowCount: problematicRows.length,
    partialPassiveRowCount: partialRows.length,
    passiveRowCount: rowCoverages.length,
    readyPassiveRowCount: readyRows.length,
    rowTextureClippedTextureCount: rowTextureFrame.clippedTextureCount,
    rowTextureMissingElementCount: rowTextureFrame.missingElementCount,
    rowTextureMissingSurfaceCount: rowTextureFrame.missingSurfaceCount,
    rowTextureMissingTextureCount: rowTextureFrame.missingTextureCount,
    rowTextureReadyTextureCount: rowTextureFrame.readyTextureCount,
    rowTextureStaleElementCount: rowTextureFrame.staleElementCount,
    rowTextureStaleTextureCount: rowTextureFrame.staleTextureCount,
    rowTextureVisibleSourceCount: rowTextureFrame.visibleSourceCount,
    rowSamples: [
      ...problematicRows,
      ...readyRows.slice(0, Math.max(0, 80 - problematicRows.length)),
    ].slice(0, 80),
    sourceSummaries: snapshotSources.slice(0, 24).map((source) => ({
      rect: roundGpuFlowChromeReproRect(source.targetRectCss),
      rowId: source.rowId,
      sectionId: source.sectionId,
      sourceId: source.sourceId,
      surfaceId: source.surfaceId,
    })),
  };
}

function summarizeGpuFlowRetainedTextLikeRowSnapshotSourceElement({
  element,
  source,
}: {
  readonly element: HTMLElement | null;
  readonly source: GpuRetainedTextLikeRowSnapshotSource;
}) {
  if (!element) {
    return {
      hasElement: false,
      sectionId: source.sectionId,
      sourceId: source.sourceId,
      sourceKeyMatches: false,
    };
  }
  const rect = element.getBoundingClientRect();
  const sourceKey =
    element.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey ?? "";
  return {
    childElementCount: element.childElementCount,
    clientHeight: roundChromeReproMs(element.clientHeight),
    clientWidth: roundChromeReproMs(element.clientWidth),
    datasetSourceKeyLength: sourceKey.length,
    hasElement: true,
    rect: roundGpuFlowChromeReproRect({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }),
    scrollHeight: roundChromeReproMs(element.scrollHeight),
    scrollWidth: roundChromeReproMs(element.scrollWidth),
    sectionId: source.sectionId,
    sourceId: source.sourceId,
    sourceKeyLength: source.sourceKey.length,
    sourceKeyMatches: sourceKey === source.sourceKey,
    textContentLength: element.textContent?.length ?? 0,
  };
}

function groupGpuFlowCoverageRectsBySurfaceId(
  rects: readonly {
    readonly sourceRectCss: GpuRect;
    readonly surfaceId: string;
  }[],
): ReadonlyMap<string, readonly GpuRect[]> {
  const grouped = new Map<string, GpuRect[]>();
  for (const rect of rects) {
    const sourceRects = grouped.get(rect.surfaceId) ?? [];
    sourceRects.push(rect.sourceRectCss);
    grouped.set(rect.surfaceId, sourceRects);
  }
  return grouped;
}

function estimateGpuFlowRectCoverageRatio(
  rect: GpuRect,
  coverageRects: readonly GpuRect[],
): number {
  const area = rect.width * rect.height;
  if (area <= 0) {
    return 0;
  }
  let coveredArea = 0;
  for (const coverageRect of coverageRects) {
    const intersection = intersectGpuFlowChromeReproRects(rect, coverageRect);
    if (!intersection) {
      continue;
    }
    coveredArea += intersection.width * intersection.height;
  }
  return Math.min(1, coveredArea / area);
}

function createGpuFlowRetainedContentSurfaceVisualState(
  surface: GpuContentSurface,
): {
  readonly contentRect: GpuRect;
  readonly rect: GpuRect;
  readonly scrollbars: readonly {
    readonly axis: string;
    readonly state: unknown;
    readonly thumbRect: GpuRect;
    readonly trackRect: GpuRect;
  }[];
  readonly scrollOffset: { readonly x: number; readonly y: number };
  readonly surfaceId: string;
  readonly switches: readonly {
    readonly checked: boolean;
    readonly displayValue: string;
    readonly rect: GpuRect;
    readonly rowId: string;
  }[];
  readonly textLikeRows: readonly {
    readonly defaultDisplayValue: string;
    readonly displayValue: string;
    readonly editorKind: string;
    readonly linePolicy: string;
    readonly nativeControlActive: boolean;
    readonly rect: GpuRect;
    readonly rowId: string;
    readonly rowLabel: string;
    readonly rowRect: GpuRect;
    readonly wrapLines: boolean;
  }[];
  readonly viewportRect: GpuRect;
  readonly zIndex: number;
} | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  const rowById = new Map(retainedScene.rows.map((row) => [row.id, row]));
  const switches = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentSwitchVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const textLikeRows = retainedScene.drawCommands
    .map((command) =>
      createGpuFlowRetainedContentTextLikeVisualState({ command, rowById }),
    )
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const scrollbars = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentScrollbarVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  if (
    switches.length === 0 &&
    scrollbars.length === 0 &&
    textLikeRows.length === 0
  ) {
    return null;
  }
  return {
    contentRect: roundGpuFlowChromeReproRect(retainedScene.contentRect),
    rect: roundGpuFlowChromeReproRect(surface.rect),
    scrollbars,
    scrollOffset: {
      x: roundChromeReproMs(retainedScene.scrollOffset.x),
      y: roundChromeReproMs(retainedScene.scrollOffset.y),
    },
    surfaceId: surface.id,
    switches,
    textLikeRows,
    viewportRect: roundGpuFlowChromeReproRect(retainedScene.viewportRect),
    zIndex: surface.zIndex,
  };
}

function createGpuFlowRetainedContentTextLikeVisualState({
  command,
  rowById,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly rowById: ReadonlyMap<
    string,
    NonNullable<GpuContentSurface["retainedScene"]>["rows"][number]
  >;
}): {
  readonly defaultDisplayValue: string;
  readonly displayValue: string;
  readonly editorKind: string;
  readonly linePolicy: string;
  readonly nativeControlActive: boolean;
  readonly rect: GpuRect;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly rowRect: GpuRect;
  readonly wrapLines: boolean;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "text-like") {
    return null;
  }
  const row = rowById.get(command.rowId);
  return {
    defaultDisplayValue: command.control.defaultDisplayValue,
    displayValue: command.control.displayValue,
    editorKind: command.control.editorKind,
    linePolicy: command.control.policy.linePolicy,
    nativeControlActive: row?.state.nativeControlActive ?? false,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
    rowLabel: row?.label ?? "",
    rowRect: row
      ? roundGpuFlowChromeReproRect(row.projectedRect)
      : { height: 0, width: 0, x: 0, y: 0 },
    wrapLines: command.control.policy.wrapLines,
  };
}

function createGpuFlowRetainedContentSwitchVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly checked: boolean;
  readonly displayValue: string;
  readonly rect: GpuRect;
  readonly rowId: string;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "switch") {
    return null;
  }
  return {
    checked: command.control.checked,
    displayValue: command.control.displayValue,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
  };
}

function createGpuFlowRetainedContentScrollbarVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly axis: string;
  readonly state: unknown;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
} | null {
  if (command.kind !== "scrollbar") {
    return null;
  }
  return {
    axis: command.axis,
    state: command.state ?? null,
    thumbRect: roundGpuFlowChromeReproRect(command.thumbRect),
    trackRect: roundGpuFlowChromeReproRect(command.trackRect),
  };
}

function summarizeRetainedTexturePageDescriptor(
  descriptor: RetainedTexturePageDescriptor,
): {
  readonly contentVersion: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceRectCss: GpuRect;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly tileColumn: number;
  readonly tileRow: number;
} {
  return {
    contentVersion: descriptor.contentVersion,
    lodLevel: descriptor.lodLevel,
    lodScale: roundChromeReproMs(descriptor.lodScale),
    pixelHeight: descriptor.pixelHeight,
    pixelWidth: descriptor.pixelWidth,
    sourceRectCss: roundGpuFlowChromeReproRect(descriptor.sourceRectCss),
    sourceWindowCss: roundGpuFlowChromeReproRect(descriptor.sourceWindowCss),
    surfaceId: descriptor.surfaceId,
    tileColumn: descriptor.tileColumn,
    tileRow: descriptor.tileRow,
  };
}

function intersectGpuFlowChromeReproRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, maxX - x);
  const height = Math.max(0, maxY - y);
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function roundGpuFlowChromeReproRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}

function roundGpuFlowChromeReproRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}
