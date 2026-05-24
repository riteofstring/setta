import {
  isChromeReproActive,
  isChromeReproVerboseGpuFlowActive,
  nowChromeReproPerformanceMs,
  postMeasuredChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { RetainedTexturePageDescriptor } from "../retainedTexturePages";
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import {
  createGpuFlowRetainedContentSurfaceVisualState,
  createGpuFlowRetainedContentSurfaceVisualSummary,
} from "./flowRetainedContentVisualDiagnostics";

let lastRetainedContentVisualStateSignature: string | null = null;
let lastRetainedDisplayFrameSignature: string | null = null;
let lastRetainedDomControlSignature: string | null = null;

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
    domControlPlaneCompletenessSummary: summarizeDomControlPlaneCompleteness(
      diagnostics.domControlPlaneCompleteness,
    ),
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
        domControlPlaneCompleteness:
          diagnostics.domControlPlaneCompleteness.slice(0, 40),
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

function summarizeDomControlPlaneCompleteness(
  states: RetainedDisplayFrame["diagnostics"]["domControlPlaneCompleteness"],
) {
  const blockingReasons: Record<string, number> = {};
  let activeCount = 0;
  let blockedCount = 0;
  let projectedCount = 0;
  let visibleNonemptyCount = 0;
  for (const state of states) {
    if (state.active) {
      activeCount += 1;
    }
    if (state.projected) {
      projectedCount += 1;
    }
    if (state.visibleNonempty) {
      visibleNonemptyCount += 1;
    }
    if (state.blockingReasons.length > 0) {
      blockedCount += 1;
    }
    for (const reason of state.blockingReasons) {
      blockingReasons[reason] = (blockingReasons[reason] ?? 0) + 1;
    }
  }
  return {
    activeCount,
    blockedCount,
    blockingReasons,
    projectedCount,
    sourceCount: states.length,
    visibleNonemptyCount,
  };
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

export function postGpuFlowRetainedDomControlChromeReproEvent({
  frame,
  preparedFrame,
  sources,
  viewportInteractionActive,
}: {
  readonly frame: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly viewportInteractionActive: boolean;
}) {
  if (
    !isChromeReproActive() ||
    sources.length === 0 ||
    viewportInteractionActive
  ) {
    return;
  }
  const buildStartedAtMs = nowChromeReproPerformanceMs();
  const verbose = isChromeReproVerboseGpuFlowActive();
  const state = {
    drawQuadCount: preparedFrame.drawQuadCount,
    refinementPageCount: preparedFrame.refinementPageCount,
    sourceCount: sources.length,
    targetDescriptorCount: preparedFrame.refinementDescriptors.length,
    domControlPlaneVisibility: createGpuFlowRetainedDomControlVisibilitySummary(
      {
        sources,
      },
    ),
  };
  const verboseState = verbose
    ? {
        targetDescriptors: preparedFrame.refinementDescriptors
          .slice(0, 24)
          .map(summarizeRetainedTexturePageDescriptor),
        domControlPlaneVisibilityDetails:
          createGpuFlowRetainedDomControlVisibilityState({
            sources,
          }),
      }
    : {};
  const signature = JSON.stringify({ ...state, ...verboseState });
  if (signature === lastRetainedDomControlSignature) {
    return;
  }
  lastRetainedDomControlSignature = signature;
  postMeasuredChromeReproEvent(
    "gpu-flow-retained-dom-controls",
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

function createGpuFlowRetainedDomControlVisibilityState({
  sources,
}: {
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}) {
  const rowStates = sources.map(summarizeGpuFlowRetainedDomControlPlaneSource);
  const clippedRows = rowStates.filter((row) => row.clipped);
  const projectedRows = rowStates.filter((row) => row.projected);
  const missingProjectedRows = rowStates.filter((row) => !row.projected);
  return {
    activeRowCount: rowStates.filter((row) => row.active).length,
    clippedRowCount: clippedRows.length,
    missingProjectedRowCount: missingProjectedRows.length,
    projectedRowCount: projectedRows.length,
    rowCount: rowStates.length,
    rowSamples: [
      ...missingProjectedRows,
      ...clippedRows,
      ...projectedRows.slice(
        0,
        Math.max(0, 80 - missingProjectedRows.length - clippedRows.length),
      ),
    ].slice(0, 80),
    sourceSummaries: rowStates.slice(0, 24),
    visibleNonemptyRowCount: rowStates.filter((row) => row.visibleNonempty)
      .length,
  };
}

function createGpuFlowRetainedDomControlVisibilitySummary({
  sources,
}: {
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}) {
  const surfaceSummaries = new Map<
    string,
    {
      activeRowCount: number;
      clippedRowCount: number;
      missingProjectedRowCount: number;
      projectedRowCount: number;
      rowCount: number;
      surfaceId: string;
      visibleNonemptyRowCount: number;
    }
  >();
  const problemRowSamples: ReturnType<
    typeof summarizeGpuFlowRetainedDomControlPlaneSource
  >[] = [];
  let activeRowCount = 0;
  let clippedRowCount = 0;
  let missingProjectedRowCount = 0;
  let projectedRowCount = 0;
  let visibleNonemptyRowCount = 0;

  for (const source of sources) {
    const row = summarizeGpuFlowRetainedDomControlPlaneSource(source);
    const surfaceSummary = surfaceSummaries.get(source.surfaceId) ?? {
      activeRowCount: 0,
      clippedRowCount: 0,
      missingProjectedRowCount: 0,
      projectedRowCount: 0,
      rowCount: 0,
      surfaceId: source.surfaceId,
      visibleNonemptyRowCount: 0,
    };
    surfaceSummary.rowCount += 1;
    if (row.active) {
      activeRowCount += 1;
      surfaceSummary.activeRowCount += 1;
    }
    if (row.visibleNonempty) {
      visibleNonemptyRowCount += 1;
      surfaceSummary.visibleNonemptyRowCount += 1;
    }
    if (row.projected) {
      projectedRowCount += 1;
      surfaceSummary.projectedRowCount += 1;
    } else {
      missingProjectedRowCount += 1;
      surfaceSummary.missingProjectedRowCount += 1;
      if (problemRowSamples.length < 8) {
        problemRowSamples.push(row);
      }
    }
    if (row.clipped) {
      clippedRowCount += 1;
      surfaceSummary.clippedRowCount += 1;
    }
    surfaceSummaries.set(source.surfaceId, surfaceSummary);
  }

  return {
    activeRowCount,
    clippedRowCount,
    missingProjectedRowCount,
    problemRowSamples,
    projectedRowCount,
    rowCount: sources.length,
    surfaceSummaries: [...surfaceSummaries.values()]
      .sort(
        (left, right) =>
          right.missingProjectedRowCount - left.missingProjectedRowCount ||
          right.rowCount - left.rowCount ||
          left.surfaceId.localeCompare(right.surfaceId),
      )
      .slice(0, 16),
    visibleNonemptyRowCount,
  };
}

function summarizeGpuFlowRetainedDomControlPlaneSource(
  source: GpuRetainedDomControlSourceDescriptor,
) {
  const projected =
    source.clipRectSurfaceCssPx.width > 0 &&
    source.clipRectSurfaceCssPx.height > 0;
  const clipped =
    projected &&
    (source.clipRectSurfaceCssPx.x !== source.controlRectSurfaceCssPx.x ||
      source.clipRectSurfaceCssPx.y !== source.controlRectSurfaceCssPx.y ||
      source.clipRectSurfaceCssPx.width !==
        source.controlRectSurfaceCssPx.width ||
      source.clipRectSurfaceCssPx.height !==
        source.controlRectSurfaceCssPx.height);
  return {
    active: source.active,
    clipped,
    defaultValueLength: source.defaultValue.length,
    disabled: source.disabled,
    editorKind: source.editorKind,
    error: source.error,
    language: source.language ?? "plain",
    layerSlot: source.layerSlot,
    lifecycleState: source.lifecycleState,
    linePolicy: source.linePolicy,
    maxVisibleLines: source.maxVisibleLines,
    minVisibleLines: source.minVisibleLines,
    projected,
    rect: roundGpuFlowChromeReproRect(source.worldRectFlowPx),
    rendererFamily: source.rendererFamily,
    rowId: source.rowId,
    sectionId: source.sectionId,
    sourceId: source.sourceId,
    surfaceId: source.surfaceId,
    valueLength: source.value.length,
    visibleNonempty: source.value.length > 0 && projected,
    wrapLines: source.wrapLines,
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

function roundGpuFlowChromeReproRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}
