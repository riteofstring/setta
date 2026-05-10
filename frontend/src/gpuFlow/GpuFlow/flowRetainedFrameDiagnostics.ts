import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type { GpuRetainedContentDrawCommand } from "../retainedContentScene";
import type {
  RetainedTextLikePreviewPageFrameSurface,
  RetainedTextLikePreviewPageMaintenanceResult,
  RetainedTextLikePreviewPagePreparedFrame,
} from "../retainedTextLikePreviewPageManager";
import type { RetainedTexturePageDescriptor } from "../retainedTexturePages";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import type { GpuRetainedTextLikePreviewSource } from "./retainedTextLikePreviewSources";

let lastRetainedContentVisualStateSignature: string | null = null;
let lastRetainedTextLikePreviewSignature: string | null = null;
let lastRetainedTextLikePreviewMaintenanceSignature: string | null = null;

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

export function postGpuFlowRetainedTextLikePreviewChromeReproEvent({
  frame,
  preparedFrame,
  previewSources,
  previewSurfaces,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedTextLikePreviewPagePreparedFrame;
  readonly previewSources: readonly GpuRetainedTextLikePreviewSource[];
  readonly previewSurfaces: readonly RetainedTextLikePreviewPageFrameSurface[];
}) {
  if (!isChromeReproActive() || preparedFrame.sourceCount === 0) {
    return;
  }
  const state = {
    baseDrawQuads: preparedFrame.baseDrawQuads.slice(0, 24).map((quad) => ({
      desiredDescriptor: summarizeRetainedTexturePageDescriptor(
        quad.desiredDescriptor,
      ),
      fallback: quad.fallback,
      pageDescriptor: summarizeRetainedTexturePageDescriptor(
        quad.page.descriptor,
      ),
      sampleRectCss: roundGpuFlowChromeReproRect(quad.sampleRectCss),
      staleContent: quad.staleContent,
    })),
    drawQuadCount: preparedFrame.drawQuadCount,
    missingPageCount: preparedFrame.missingPageCount,
    omittedPreviewCount: preparedFrame.omittedPreviewCount,
    previewSurfaces: previewSurfaces.slice(0, 24).map((surface) => ({
      layoutTextureSourceRect: roundGpuFlowChromeReproRect(
        surface.layout.textureSourceRect,
      ),
      sourceId: surface.sourceId,
      sourceKeyLength: surface.sourceKey.length,
      sourceWindowCss: roundGpuFlowChromeReproRect(surface.sourceWindowCss),
      surfaceId: surface.surfaceId,
      visibleSourceRectCss: roundGpuFlowChromeReproRect(
        surface.visibleSourceRectCss,
      ),
      zIndex: surface.layout.zIndex ?? 0,
    })),
    sourceCount: preparedFrame.sourceCount,
    targetDescriptors: preparedFrame.targetDescriptors
      .slice(0, 24)
      .map(summarizeRetainedTexturePageDescriptor),
    targetDescriptorCount: preparedFrame.targetDescriptors.length,
    textLikePassiveVisibility:
      createGpuFlowRetainedTextLikePassiveVisibilityState({
        preparedFrame,
        previewSources,
      }),
  };
  const signature = JSON.stringify(state);
  if (signature === lastRetainedTextLikePreviewSignature) {
    return;
  }
  lastRetainedTextLikePreviewSignature = signature;
  postChromeReproEvent("gpu-flow-retained-text-like-preview-pages", {
    frame,
    ...state,
  });
}

export function postGpuFlowRetainedTextLikePreviewMaintenanceChromeReproEvent({
  elementBySourceId,
  frame,
  maintenanceResult,
  preparedFrame,
  previewSources,
  viewportInteractionActive,
}: {
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly maintenanceResult: RetainedTextLikePreviewPageMaintenanceResult;
  readonly preparedFrame: RetainedTextLikePreviewPagePreparedFrame;
  readonly previewSources: readonly GpuRetainedTextLikePreviewSource[];
  readonly viewportInteractionActive: boolean;
}) {
  if (!isChromeReproActive() || preparedFrame.sourceCount === 0) {
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
    omittedPreviewCount: maintenanceResult.omittedPreviewCount,
    postMaintenanceMissingPageCount:
      maintenanceResult.postMaintenanceMissingPageCount,
    queuedWorkCount: maintenanceResult.queuedWorkCount,
    queuedWorkCountBeforeUpload: maintenanceResult.queuedWorkCountBeforeUpload,
    remainingUploadableWorkCount:
      maintenanceResult.remainingUploadableWorkCount,
    skippedItemCount: maintenanceResult.skippedItemCount,
    sourceElements: previewSources.slice(0, 40).map((source) =>
      summarizeGpuFlowRetainedTextLikePreviewSourceElement({
        element: elementBySourceId.get(source.sourceId) ?? null,
        source,
      }),
    ),
    sourceElementCount: previewSources.length,
    targetDescriptorCount: maintenanceResult.targetDescriptorCount,
    uploadedBytes: maintenanceResult.uploadedBytes,
    uploadCount: maintenanceResult.uploadCount,
    uploadMs: roundChromeReproMs(maintenanceResult.uploadMs),
    viewportInteractionActive,
  };
  const signature = JSON.stringify(state);
  if (signature === lastRetainedTextLikePreviewMaintenanceSignature) {
    return;
  }
  lastRetainedTextLikePreviewMaintenanceSignature = signature;
  postChromeReproEvent("gpu-flow-retained-text-like-preview-maintenance", {
    frame,
    ...state,
  });
}

function createGpuFlowRetainedTextLikePassiveVisibilityState({
  preparedFrame,
  previewSources,
}: {
  readonly preparedFrame: RetainedTextLikePreviewPagePreparedFrame;
  readonly previewSources: readonly GpuRetainedTextLikePreviewSource[];
}) {
  const committedRectsBySourceId = groupGpuFlowPreviewCoverageRectsBySourceId(
    preparedFrame.committedPageRects.map((rect) => ({
      sourceId: rect.sourceId,
      sourceRectCss: rect.sourceRectCss,
    })),
  );
  const missingRectsBySourceId = groupGpuFlowPreviewCoverageRectsBySourceId(
    preparedFrame.refinementDescriptors.map((descriptor) => ({
      sourceId: descriptor.surfaceId,
      sourceRectCss: descriptor.sourceRectCss,
    })),
  );
  const rowCoverages = previewSources.flatMap((source) =>
    source.previews.flatMap((preview) => {
      const controlRect = {
        height: preview.height,
        width: preview.width,
        x: preview.x,
        y: preview.y,
      };
      const visibleRect = intersectGpuFlowChromeReproRects(
        controlRect,
        source.textureSourceRect,
      );
      if (!visibleRect) {
        return [];
      }
      const availableCoverageRatio = estimateGpuFlowRectCoverageRatio(
        visibleRect,
        committedRectsBySourceId.get(source.sourceId) ?? [],
      );
      const missingCoverageRatio = estimateGpuFlowRectCoverageRatio(
        visibleRect,
        missingRectsBySourceId.get(source.sourceId) ?? [],
      );
      const passivePixelsReady = availableCoverageRatio >= 0.95;
      return [
        {
          availableCoverageRatio: roundGpuFlowChromeReproRatio(
            availableCoverageRatio,
          ),
          codeLength: preview.code.length,
          defaultValueLength: preview.defaultValue.length,
          disabled: preview.disabled,
          error: preview.error,
          language: preview.language ?? "plain",
          linePolicy: preview.linePolicy,
          missingCoverageRatio:
            roundGpuFlowChromeReproRatio(missingCoverageRatio),
          passivePixelsReady,
          rect: roundGpuFlowChromeReproRect(controlRect),
          rowId: preview.rowId,
          sectionId: source.sectionId,
          sourceId: source.sourceId,
          visibleRect: roundGpuFlowChromeReproRect(visibleRect),
          wrapLines: preview.wrapLines,
        },
      ];
    }),
  );
  const problematicRows = rowCoverages.filter((row) => !row.passivePixelsReady);
  const readyRows = rowCoverages.filter((row) => row.passivePixelsReady);
  const partialRows = rowCoverages.filter(
    (row) => !row.passivePixelsReady && row.availableCoverageRatio > 0,
  );
  return {
    blankPassiveRowCount: rowCoverages.filter(
      (row) => row.availableCoverageRatio <= 0,
    ).length,
    committedPageRectCount: preparedFrame.committedPageRects.length,
    missingPageRectCount: preparedFrame.refinementDescriptors.length,
    missingPassiveRowCount: problematicRows.length,
    partialPassiveRowCount: partialRows.length,
    passiveRowCount: rowCoverages.length,
    readyPassiveRowCount: readyRows.length,
    rowSamples: [
      ...problematicRows,
      ...readyRows.slice(0, Math.max(0, 80 - problematicRows.length)),
    ].slice(0, 80),
    sourceSummaries: previewSources.slice(0, 24).map((source) => ({
      previewCount: source.previews.length,
      sectionId: source.sectionId,
      sourceId: source.sourceId,
      textureSourceRect: roundGpuFlowChromeReproRect(source.textureSourceRect),
    })),
  };
}

function summarizeGpuFlowRetainedTextLikePreviewSourceElement({
  element,
  source,
}: {
  readonly element: HTMLElement | null;
  readonly source: GpuRetainedTextLikePreviewSource;
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
    element.dataset.gpuFlowRetainedTextLikePreviewSourceKey ?? "";
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

function groupGpuFlowPreviewCoverageRectsBySourceId(
  rects: readonly {
    readonly sourceId: string;
    readonly sourceRectCss: GpuRect;
  }[],
): ReadonlyMap<string, readonly GpuRect[]> {
  const grouped = new Map<string, GpuRect[]>();
  for (const rect of rects) {
    const sourceRects = grouped.get(rect.sourceId) ?? [];
    sourceRects.push(rect.sourceRectCss);
    grouped.set(rect.sourceId, sourceRects);
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
