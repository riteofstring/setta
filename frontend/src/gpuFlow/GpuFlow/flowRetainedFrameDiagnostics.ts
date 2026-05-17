import {
  isChromeReproActive,
  isChromeReproVerboseGpuFlowActive,
  nowChromeReproPerformanceMs,
  postMeasuredChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { RetainedTexturePageDescriptor } from "../retainedTexturePages";
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import {
  createGpuFlowRetainedContentSurfaceVisualState,
  createGpuFlowRetainedContentSurfaceVisualSummary,
} from "./flowRetainedContentVisualDiagnostics";
import type { GpuRetainedTextLikeRowSnapshotSource } from "./retainedTextLikeRowSnapshotSources";

let lastRetainedContentVisualStateSignature: string | null = null;
let lastRetainedDisplayFrameSignature: string | null = null;
let lastRetainedTextLikeRowSnapshotSignature: string | null = null;
let lastRetainedTextLikeRowSnapshotMaintenanceSignature: string | null = null;

type RetainedDisplayFrameChromeReproHoldSummary = {
  readonly heldMotionFrameCount: number;
  readonly heldTransactionCount: number;
  readonly heldTransactionDurationMs: number;
  readonly holdReason: string | null;
  readonly maxHeldMotionAgeMs: number;
};

export function postGpuFlowRetainedContentVisualStateChromeReproEvent({
  frame,
  scene,
  viewportInteractionActive,
}: {
  readonly frame: number;
  readonly scene: GpuFlowScene | undefined;
  readonly viewportInteractionActive: boolean;
}) {
  if (!isChromeReproActive() || !scene || viewportInteractionActive) {
    return;
  }
  const buildStartedAtMs = nowChromeReproPerformanceMs();
  const verbose = isChromeReproVerboseGpuFlowActive();
  const surfaceSummaries = scene.contentSurfaces
    .map(createGpuFlowRetainedContentSurfaceVisualSummary)
    .filter(
      (surface): surface is NonNullable<typeof surface> => surface !== null,
    );
  if (surfaceSummaries.length === 0) {
    return;
  }
  const surfaces = verbose
    ? scene.contentSurfaces
        .map(createGpuFlowRetainedContentSurfaceVisualState)
        .filter(
          (surface): surface is NonNullable<typeof surface> => surface !== null,
        )
    : [];
  const state = {
    surfaceCount: surfaceSummaries.length,
    surfaceSummaries,
  };
  const signature = JSON.stringify(verbose ? { ...state, surfaces } : state);
  if (signature === lastRetainedContentVisualStateSignature) {
    return;
  }
  lastRetainedContentVisualStateSignature = signature;
  postMeasuredChromeReproEvent(
    "gpu-flow-retained-content-visual-state",
    {
      frame,
      ...state,
      ...(verbose ? { surfaces } : {}),
    },
    {
      buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
    },
  );
}

export function postGpuFlowRetainedDisplayFrameChromeReproEvent({
  frame,
  preparedFrame,
  publishedFrame,
  viewportInteractionActive,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedFrame: RetainedDisplayFrame;
  readonly viewportInteractionActive: boolean;
}) {
  if (!isChromeReproActive()) {
    return;
  }
  const buildStartedAtMs = nowChromeReproPerformanceMs();
  const verbose = isChromeReproVerboseGpuFlowActive();
  const proof = publishedFrame.coverageProof;
  const diagnostics = publishedFrame.diagnostics;
  const continuityProof = diagnostics.continuityProof;
  const holdDiagnostics = diagnostics.holdDiagnostics;
  const holdSummary =
    createRetainedDisplayFrameChromeReproHoldSummary(holdDiagnostics);
  const state = {
    activeIslandTransactionMode: diagnostics.activeIslandTransaction.mode,
    continuityReason: continuityProof.reason,
    compatiblePageCount: diagnostics.compatiblePageCount,
    coverageReadiness: diagnostics.coverageReadiness,
    desiredScrollRevision: diagnostics.desiredScrollRevision,
    exactPageCount: diagnostics.exactPageCount,
    fidelityReadiness: diagnostics.fidelityReadiness,
    ...holdSummary,
    motionMaxConsecutiveTrueHoleFrames:
      continuityProof.maxConsecutiveTrueHoleFrames,
    motionOverlapCoveredAreaCssPx: roundChromeReproMs(
      continuityProof.overlapCoveredAreaCssPx,
    ),
    preparedFrameId: preparedFrame.frame,
    publishedFrameId: publishedFrame.id,
    publishedPreparedFrameId: diagnostics.publishedPreparedFrameId,
    rejectedFrameCount: diagnostics.rejectedFrameCount,
    refinementPageCount: diagnostics.refinementPageCount,
    transactionOutcome: diagnostics.transactionOutcome,
    trueHoleAreaCssPx: roundChromeReproMs(continuityProof.trueHoleAreaCssPx),
    trueHoleAreaRatio: roundChromeReproMs(continuityProof.trueHoleAreaRatio),
    trueHoleRectCount: diagnostics.trueHoleRectCount,
    viewportInteractionActive,
    visibleRectCount: proof.visibleContentRects.length,
  };
  const verboseState = verbose
    ? {
        activeIslandTransaction: diagnostics.activeIslandTransaction,
        holdDiagnostics,
        compatibleCoverageRects: proof.compatibleCoverageRects
          .slice(0, 24)
          .map(roundGpuFlowChromeReproRect),
        exactCoverageRects: proof.exactCoverageRects
          .slice(0, 24)
          .map(roundGpuFlowChromeReproRect),
        rejectedStaleRects: proof.rejectedStaleRects
          .slice(0, 24)
          .map((entry) => ({
            reason: entry.reason,
            rect: roundGpuFlowChromeReproRect(entry.rect),
          })),
        rejectedPreparedFrameIds: proof.rejectedPreparedFrameIds.slice(-24),
        trueHoleRects: proof.trueHoleRects
          .slice(0, 24)
          .map(roundGpuFlowChromeReproRect),
        visibleRects: proof.visibleContentRects
          .slice(0, 24)
          .map(roundGpuFlowChromeReproRect),
      }
    : {};
  const signature = JSON.stringify({ ...state, ...verboseState });
  if (signature === lastRetainedDisplayFrameSignature) {
    return;
  }
  lastRetainedDisplayFrameSignature = signature;
  postMeasuredChromeReproEvent(
    "gpu-flow-retained-display-frame",
    {
      frame,
      ...state,
      ...verboseState,
    },
    {
      buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
    },
  );
}

function createRetainedDisplayFrameChromeReproHoldSummary(
  holdDiagnostics: RetainedDisplayFrame["diagnostics"]["holdDiagnostics"],
): RetainedDisplayFrameChromeReproHoldSummary {
  if (!holdDiagnostics) {
    return {
      heldMotionFrameCount: 0,
      heldTransactionCount: 0,
      heldTransactionDurationMs: 0,
      holdReason: null,
      maxHeldMotionAgeMs: 0,
    };
  }
  return {
    heldMotionFrameCount: holdDiagnostics.heldMotionFrameCount,
    heldTransactionCount: holdDiagnostics.heldTransactionCount,
    heldTransactionDurationMs: holdDiagnostics.heldTransactionDurationMs,
    holdReason: holdDiagnostics.holdReason,
    maxHeldMotionAgeMs: holdDiagnostics.maxHeldMotionAgeMs,
  };
}

export function postGpuFlowRetainedTextLikeRowSnapshotChromeReproEvent({
  frame,
  preparedFrame,
  snapshotSources,
  viewportInteractionActive,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly viewportInteractionActive: boolean;
}) {
  if (
    !isChromeReproActive() ||
    snapshotSources.length === 0 ||
    viewportInteractionActive
  ) {
    return;
  }
  const buildStartedAtMs = nowChromeReproPerformanceMs();
  const verbose = isChromeReproVerboseGpuFlowActive();
  const state = {
    drawQuadCount: preparedFrame.drawQuadCount,
    refinementPageCount: preparedFrame.refinementPageCount,
    snapshotCount: snapshotSources.length,
    targetDescriptorCount: preparedFrame.refinementDescriptors.length,
    textLikePassiveVisibility:
      createGpuFlowRetainedTextLikeRowSnapshotVisibilitySummary({
        preparedFrame,
        snapshotSources,
      }),
  };
  const verboseState = verbose
    ? {
        targetDescriptors: preparedFrame.refinementDescriptors
          .slice(0, 24)
          .map(summarizeRetainedTexturePageDescriptor),
        textLikePassiveVisibilityDetails:
          createGpuFlowRetainedTextLikeRowSnapshotVisibilityState({
            preparedFrame,
            snapshotSources,
          }),
      }
    : {};
  const signature = JSON.stringify({ ...state, ...verboseState });
  if (signature === lastRetainedTextLikeRowSnapshotSignature) {
    return;
  }
  lastRetainedTextLikeRowSnapshotSignature = signature;
  postMeasuredChromeReproEvent(
    "gpu-flow-retained-text-like-row-snapshots",
    {
      frame,
      ...state,
      ...verboseState,
    },
    {
      buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
    },
  );
}

export function postGpuFlowRetainedTextLikeRowSnapshotMaintenanceChromeReproEvent({
  elementBySourceId,
  frame,
  maintenanceResult,
  snapshotSources,
  viewportInteractionActive,
}: {
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly maintenanceResult: RetainedContentTexturePageMaintenanceResult;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
  readonly viewportInteractionActive: boolean;
}) {
  if (
    !isChromeReproActive() ||
    snapshotSources.length === 0 ||
    viewportInteractionActive
  ) {
    return;
  }
  const buildStartedAtMs = nowChromeReproPerformanceMs();
  const verbose = isChromeReproVerboseGpuFlowActive();
  const state = {
    budgetExhausted: maintenanceResult.budgetExhausted,
    diagnosticCount: maintenanceResult.diagnostics.length,
    diagnosticSummary: summarizeRetainedTextureUploadDiagnostics(
      maintenanceResult.diagnostics,
    ),
    executedItemCount: maintenanceResult.executedItemCount,
    memory: maintenanceResult.memory,
    refinementPageCount: maintenanceResult.refinementPageCount,
    postMaintenanceRefinementPageCount:
      maintenanceResult.postMaintenanceRefinementPageCount,
    queuedWorkCount: maintenanceResult.queuedWorkCount,
    queuedWorkCountBeforeUpload: maintenanceResult.queuedWorkCountBeforeUpload,
    remainingUploadableWorkCount:
      maintenanceResult.remainingUploadableWorkCount,
    skippedItemCount: maintenanceResult.skippedItemCount,
    sourceElementCount: snapshotSources.length,
    targetDescriptorCount: maintenanceResult.targetDescriptorCount,
    uploadedBytes: maintenanceResult.uploadedBytes,
    uploadCount: maintenanceResult.uploadCount,
    uploadMs: roundChromeReproMs(maintenanceResult.uploadMs),
    viewportInteractionActive,
  };
  const verboseState = verbose
    ? {
        diagnostics: maintenanceResult.diagnostics
          .slice(0, 16)
          .map(summarizeRetainedTextureUploadDiagnostic),
        sourceElements: snapshotSources.slice(0, 40).map((source) =>
          summarizeGpuFlowRetainedTextLikeRowSnapshotSourceElement({
            element: elementBySourceId.get(source.sourceId) ?? null,
            source,
          }),
        ),
      }
    : {};
  const signature = JSON.stringify({ ...state, ...verboseState });
  if (signature === lastRetainedTextLikeRowSnapshotMaintenanceSignature) {
    return;
  }
  lastRetainedTextLikeRowSnapshotMaintenanceSignature = signature;
  postMeasuredChromeReproEvent(
    "gpu-flow-retained-text-like-row-snapshot-maintenance",
    {
      frame,
      ...state,
      ...verboseState,
    },
    {
      buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
    },
  );
}

function summarizeRetainedTextureUploadDiagnostic(
  diagnostic: RetainedContentTexturePageMaintenanceResult["diagnostics"][number],
) {
  return {
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
  };
}

function summarizeRetainedTextureUploadDiagnostics(
  diagnostics: RetainedContentTexturePageMaintenanceResult["diagnostics"],
) {
  const summaries = new Map<
    string,
    {
      count: number;
      kind: string;
      priority: string;
      queue: string;
      rasterMs: number;
      reason: string;
      sampleSurfaceIds: string[];
      targetLod: number | null;
      uploadedBytes: number;
      uploadCount: number;
      uploadMs: number;
    }
  >();
  for (const diagnostic of diagnostics) {
    const targetLod = diagnostic.item.targetLod ?? null;
    const key = [
      diagnostic.reason,
      diagnostic.queue,
      diagnostic.item.kind,
      diagnostic.item.priority,
      targetLod ?? "none",
    ].join("|");
    const existing = summaries.get(key) ?? {
      count: 0,
      kind: diagnostic.item.kind,
      priority: diagnostic.item.priority,
      queue: diagnostic.queue,
      rasterMs: 0,
      reason: diagnostic.reason,
      sampleSurfaceIds: [],
      targetLod,
      uploadedBytes: 0,
      uploadCount: 0,
      uploadMs: 0,
    };
    existing.count += 1;
    existing.rasterMs += diagnostic.estimate.rasterMs;
    existing.uploadedBytes += diagnostic.estimate.uploadedBytes;
    existing.uploadCount += diagnostic.estimate.uploadCount;
    existing.uploadMs += diagnostic.estimate.uploadMs;
    if (
      existing.sampleSurfaceIds.length < 5 &&
      !existing.sampleSurfaceIds.includes(diagnostic.item.surfaceId)
    ) {
      existing.sampleSurfaceIds.push(diagnostic.item.surfaceId);
    }
    summaries.set(key, existing);
  }
  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      rasterMs: roundChromeReproMs(summary.rasterMs),
      targetLod:
        summary.targetLod === null
          ? null
          : roundChromeReproMs(summary.targetLod),
      uploadMs: roundChromeReproMs(summary.uploadMs),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.uploadedBytes - left.uploadedBytes ||
        left.kind.localeCompare(right.kind),
    )
    .slice(0, 32);
}

function createGpuFlowRetainedTextLikeRowSnapshotVisibilityState({
  preparedFrame,
  snapshotSources,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
}) {
  const committedRectsBySurfaceId = groupGpuFlowCoverageRectsBySurfaceId(
    preparedFrame.drawRegions.map((region) => ({
      sourceRectCss: region.sampleRectCss,
      surfaceId: region.mappingProof.ownerManifest.surfaceId,
    })),
  );
  const missingRectsBySurfaceId = groupGpuFlowCoverageRectsBySurfaceId(
    preparedFrame.refinementDescriptors.map((descriptor) => ({
      sourceRectCss: descriptor.sourceRectCss,
      surfaceId: descriptor.surfaceId,
    })),
  );
  const rowCoverages = snapshotSources.map((source) => {
    const availableCoverageRatio = estimateGpuFlowRectCoverageRatio(
      source.targetRectCss,
      committedRectsBySurfaceId.get(source.surfaceId) ?? [],
    );
    const missingCoverageRatio = estimateGpuFlowRectCoverageRatio(
      source.targetRectCss,
      missingRectsBySurfaceId.get(source.surfaceId) ?? [],
    );
    const passivePixelsReady = availableCoverageRatio >= 0.95;
    return {
      availableCoverageRatio: roundGpuFlowChromeReproRatio(
        availableCoverageRatio,
      ),
      codeLength: source.code.length,
      defaultValueLength: source.defaultValue.length,
      disabled: source.disabled,
      editorKind: source.editorKind,
      error: source.error,
      language: source.language ?? "plain",
      linePolicy: source.linePolicy,
      maxVisibleLines: source.maxVisibleLines,
      minVisibleLines: source.minVisibleLines,
      missingCoverageRatio: roundGpuFlowChromeReproRatio(missingCoverageRatio),
      passivePixelsReady,
      rect: roundGpuFlowChromeReproRect(source.targetRectCss),
      rendererFamily: source.rendererFamily,
      rowId: source.rowId,
      sectionId: source.sectionId,
      sourceId: source.sourceId,
      surfaceId: source.surfaceId,
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
    committedPageRectCount: preparedFrame.drawRegions.length,
    missingPageRectCount: preparedFrame.refinementDescriptors.length,
    missingPassiveRowCount: problematicRows.length,
    partialPassiveRowCount: partialRows.length,
    passiveRowCount: rowCoverages.length,
    readyPassiveRowCount: readyRows.length,
    rowSamples: [
      ...problematicRows,
      ...readyRows.slice(0, Math.max(0, 80 - problematicRows.length)),
    ].slice(0, 80),
    sourceSummaries: snapshotSources.slice(0, 24).map((source) => ({
      editorKind: source.editorKind,
      linePolicy: source.linePolicy,
      maxVisibleLines: source.maxVisibleLines,
      minVisibleLines: source.minVisibleLines,
      rect: roundGpuFlowChromeReproRect(source.targetRectCss),
      rendererFamily: source.rendererFamily,
      rowId: source.rowId,
      sectionId: source.sectionId,
      sourceId: source.sourceId,
      sourceHeight: roundChromeReproMs(source.sourceHeight),
      sourceWidth: roundChromeReproMs(source.sourceWidth),
      surfaceId: source.surfaceId,
    })),
  };
}

function createGpuFlowRetainedTextLikeRowSnapshotVisibilitySummary({
  preparedFrame,
  snapshotSources,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly snapshotSources: readonly GpuRetainedTextLikeRowSnapshotSource[];
}) {
  const committedRectsBySurfaceId = groupGpuFlowCoverageRectsBySurfaceId(
    preparedFrame.drawRegions.map((region) => ({
      sourceRectCss: region.sampleRectCss,
      surfaceId: region.mappingProof.ownerManifest.surfaceId,
    })),
  );
  const missingRectsBySurfaceId = groupGpuFlowCoverageRectsBySurfaceId(
    preparedFrame.refinementDescriptors.map((descriptor) => ({
      sourceRectCss: descriptor.sourceRectCss,
      surfaceId: descriptor.surfaceId,
    })),
  );
  const surfaceSummaries = new Map<
    string,
    {
      blankPassiveRowCount: number;
      missingPassiveRowCount: number;
      partialPassiveRowCount: number;
      readyPassiveRowCount: number;
      rowCount: number;
      surfaceId: string;
    }
  >();
  const problemRowSamples: {
    readonly availableCoverageRatio: number;
    readonly editorKind: string;
    readonly missingCoverageRatio: number;
    readonly rect: GpuRect;
    readonly rowId: string;
    readonly sectionId: string;
    readonly surfaceId: string;
  }[] = [];
  let blankPassiveRowCount = 0;
  let missingPassiveRowCount = 0;
  let partialPassiveRowCount = 0;
  let readyPassiveRowCount = 0;

  for (const source of snapshotSources) {
    const availableCoverageRatio = estimateGpuFlowRectCoverageRatio(
      source.targetRectCss,
      committedRectsBySurfaceId.get(source.surfaceId) ?? [],
    );
    const missingCoverageRatio = estimateGpuFlowRectCoverageRatio(
      source.targetRectCss,
      missingRectsBySurfaceId.get(source.surfaceId) ?? [],
    );
    const passivePixelsReady = availableCoverageRatio >= 0.95;
    const availableCoverageRatioRounded = roundGpuFlowChromeReproRatio(
      availableCoverageRatio,
    );
    const missingCoverageRatioRounded =
      roundGpuFlowChromeReproRatio(missingCoverageRatio);
    const surfaceSummary = surfaceSummaries.get(source.surfaceId) ?? {
      blankPassiveRowCount: 0,
      missingPassiveRowCount: 0,
      partialPassiveRowCount: 0,
      readyPassiveRowCount: 0,
      rowCount: 0,
      surfaceId: source.surfaceId,
    };
    surfaceSummary.rowCount += 1;
    if (passivePixelsReady) {
      readyPassiveRowCount += 1;
      surfaceSummary.readyPassiveRowCount += 1;
    } else {
      missingPassiveRowCount += 1;
      surfaceSummary.missingPassiveRowCount += 1;
      if (problemRowSamples.length < 8) {
        problemRowSamples.push({
          availableCoverageRatio: availableCoverageRatioRounded,
          editorKind: source.editorKind,
          missingCoverageRatio: missingCoverageRatioRounded,
          rect: roundGpuFlowChromeReproRect(source.targetRectCss),
          rowId: source.rowId,
          sectionId: source.sectionId,
          surfaceId: source.surfaceId,
        });
      }
    }
    if (availableCoverageRatio <= 0) {
      blankPassiveRowCount += 1;
      surfaceSummary.blankPassiveRowCount += 1;
    } else if (!passivePixelsReady) {
      partialPassiveRowCount += 1;
      surfaceSummary.partialPassiveRowCount += 1;
    }
    surfaceSummaries.set(source.surfaceId, surfaceSummary);
  }

  return {
    blankPassiveRowCount,
    committedPageRectCount: preparedFrame.drawRegions.length,
    missingPageRectCount: preparedFrame.refinementDescriptors.length,
    missingPassiveRowCount,
    partialPassiveRowCount,
    passiveRowCount: snapshotSources.length,
    problemRowSamples,
    readyPassiveRowCount,
    surfaceSummaries: [...surfaceSummaries.values()]
      .sort(
        (left, right) =>
          right.missingPassiveRowCount - left.missingPassiveRowCount ||
          right.rowCount - left.rowCount ||
          left.surfaceId.localeCompare(right.surfaceId),
      )
      .slice(0, 16),
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
      editorKind: source.editorKind,
      hasElement: false,
      linePolicy: source.linePolicy,
      maxVisibleLines: source.maxVisibleLines,
      minVisibleLines: source.minVisibleLines,
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
    editorKind: source.editorKind,
    hasElement: true,
    linePolicy: source.linePolicy,
    maxVisibleLines: source.maxVisibleLines,
    minVisibleLines: source.minVisibleLines,
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
