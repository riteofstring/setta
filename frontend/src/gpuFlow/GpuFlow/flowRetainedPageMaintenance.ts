import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

const MIN_PRE_PUBLISH_TRUE_HOLE_REPAIR_PASSES = 12;
const TRUE_HOLE_REPAIR_AREA_EPSILON_CSS_PX = 0.5;

export type GpuFlowRetainedPageMaintenanceRun = ReturnType<
  typeof runGpuFlowRetainedPageMaintenance
>;

export function shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
  deferResolutionUpdates,
  preparedFrame,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "trueHoleRectCount"
  >;
}): boolean {
  return deferResolutionUpdates && preparedFrame.trueHoleRectCount === 0;
}

export function runGpuFlowRetainedPageMaintenance({
  darkMode,
  deferResolutionUpdates,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
  refreshFirstVisiblePages = false,
  textLikeSnapshotElementById,
  preserveFirstVisibleSourceRects = false,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
  readonly preserveFirstVisibleSourceRects?: boolean | undefined;
  readonly refreshFirstVisiblePages?: boolean | undefined;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
}): {
  readonly deferred: boolean;
  readonly result: RetainedContentTexturePageMaintenanceResult;
} {
  const deferred = shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
    deferResolutionUpdates,
    preparedFrame,
  });
  const result = deferred
    ? retainedContentPageManager.deferPostSubmitMaintenance({ preparedFrame })
    : retainedContentPageManager.runPostSubmitMaintenance({
        darkMode,
        preparedFrame,
        preserveFirstVisibleSourceRects,
        publishedProtectedPageKeys,
        refreshFirstVisiblePages,
        // Switch transitions are composited as native visuals, so texture
        // pages cache only the static retained scene state.
        textLikeSnapshotElementById,
        viewportInteractionActive: deferResolutionUpdates,
      });
  return { deferred, result };
}

export function runGpuFlowRetainedPageMaintenanceBeforePublish({
  darkMode,
  deferResolutionUpdates,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
  textLikeSnapshotElementById,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
}): GpuFlowRetainedPageMaintenanceRun | null {
  if (preparedFrame.trueHoleRectCount === 0) {
    return null;
  }
  let currentPreparedFrame = preparedFrame;
  let aggregate: RetainedContentTexturePageMaintenanceResult | null = null;
  let passCount = 0;
  const maxPassCount = resolvePrePublishTrueHoleRepairPassLimit(preparedFrame);

  while (currentPreparedFrame.trueHoleRectCount > 0) {
    if (passCount >= maxPassCount) {
      throw createRetainedPrePublishRepairPassLimitError({
        aggregate,
        currentPreparedFrame,
        maxPassCount,
        passCount,
      });
    }
    const currentTrueHoleAreaCssPx =
      retainedTrueHoleAreaCssPx(currentPreparedFrame);
    const repairPreparedFrame =
      createGpuFlowRetainedTrueHoleRepairPreparedFrame(currentPreparedFrame);
    const pass = runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
      preparedFrame: repairPreparedFrame,
      preserveFirstVisibleSourceRects: true,
      publishedProtectedPageKeys,
      refreshFirstVisiblePages: true,
      retainedContentPageManager,
      textLikeSnapshotElementById,
    });
    aggregate = aggregate
      ? combineGpuFlowRetainedPageMaintenanceResults({
          currentPreparedFrame,
          left: aggregate,
          right: pass.result,
        })
      : pass.result;
    const repairedFrame = pass.result.repairedPreparedFrame;
    const repairedTrueHoleAreaCssPx = retainedTrueHoleAreaCssPx(repairedFrame);
    if (
      !didRetainedTrueHoleRepairProgress({
        currentTrueHoleAreaCssPx,
        currentTrueHoleRectCount: currentPreparedFrame.trueHoleRectCount,
        repairedTrueHoleAreaCssPx,
        repairedTrueHoleRectCount: repairedFrame.trueHoleRectCount,
      }) &&
      pass.result.uploadCount === 0
    ) {
      throw createRetainedPrePublishRepairNoProgressError({
        currentPreparedFrame: repairPreparedFrame,
        currentTrueHoleAreaCssPx,
        pass,
        repairedFrame,
        repairedTrueHoleAreaCssPx,
      });
    }
    currentPreparedFrame = repairedFrame;
    passCount += 1;
  }

  if (!aggregate) {
    return null;
  }
  return {
    deferred: false,
    result: finalizeGpuFlowRetainedPageMaintenanceResult(aggregate),
  };
}

function combineGpuFlowRetainedPageMaintenanceResults({
  currentPreparedFrame,
  left,
  right,
}: {
  readonly currentPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly left: RetainedContentTexturePageMaintenanceResult;
  readonly right: RetainedContentTexturePageMaintenanceResult;
}): RetainedContentTexturePageMaintenanceResult {
  const repairedPreparedFrame = right.repairedPreparedFrame;
  return {
    ...right,
    budgetExhausted: left.budgetExhausted || right.budgetExhausted,
    compatibleDrawQuadCount: repairedPreparedFrame.compatibleDrawQuadCount,
    coverageCandidateCount: repairedPreparedFrame.coverageCandidateCount,
    diagnostics: [...left.diagnostics, ...right.diagnostics],
    drawQuadCount: repairedPreparedFrame.drawQuadCount,
    executedItemCount: left.executedItemCount + right.executedItemCount,
    fidelityState: repairedPreparedFrame.fidelityState,
    mergedDrawQuadCount: repairedPreparedFrame.mergedDrawQuadCount,
    needsFollowUpFrame:
      left.needsFollowUpFrame ||
      right.needsFollowUpFrame ||
      repairedPreparedFrame.refinementPageCount > 0,
    postMaintenanceRefinementPageCount:
      repairedPreparedFrame.refinementPageCount,
    queuedWorkCountBeforeUpload: left.queuedWorkCountBeforeUpload,
    rasterMs: left.rasterMs + right.rasterMs,
    refinementPageCount: currentPreparedFrame.refinementPageCount,
    rejectedStaleRectCount: repairedPreparedFrame.rejectedStaleRectCount,
    repairedPreparedFrame,
    skippedItemCount: left.skippedItemCount + right.skippedItemCount,
    targetDescriptorCount: repairedPreparedFrame.refinementDescriptors.length,
    trueHoleRectCount: repairedPreparedFrame.trueHoleRectCount,
    trueHoleVisuals: repairedPreparedFrame.trueHoleVisuals,
    uploadedBytes: left.uploadedBytes + right.uploadedBytes,
    uploadedDrawCommandCount:
      left.uploadedDrawCommandCount + right.uploadedDrawCommandCount,
    uploadCount: left.uploadCount + right.uploadCount,
    uploadMs: left.uploadMs + right.uploadMs,
  };
}

function finalizeGpuFlowRetainedPageMaintenanceResult(
  result: RetainedContentTexturePageMaintenanceResult,
): RetainedContentTexturePageMaintenanceResult {
  const repairedPreparedFrame = result.repairedPreparedFrame;
  return {
    ...result,
    compatibleDrawQuadCount: repairedPreparedFrame.compatibleDrawQuadCount,
    coverageCandidateCount: repairedPreparedFrame.coverageCandidateCount,
    drawQuadCount: repairedPreparedFrame.drawQuadCount,
    fidelityState: repairedPreparedFrame.fidelityState,
    mergedDrawQuadCount: repairedPreparedFrame.mergedDrawQuadCount,
    needsFollowUpFrame:
      result.budgetExhausted ||
      result.remainingUploadableWorkCount > 0 ||
      repairedPreparedFrame.refinementPageCount > 0,
    postMaintenanceRefinementPageCount:
      repairedPreparedFrame.refinementPageCount,
    refinementPageCount: repairedPreparedFrame.refinementPageCount,
    rejectedStaleRectCount: repairedPreparedFrame.rejectedStaleRectCount,
    targetDescriptorCount: repairedPreparedFrame.refinementDescriptors.length,
    trueHoleRectCount: repairedPreparedFrame.trueHoleRectCount,
    trueHoleVisuals: repairedPreparedFrame.trueHoleVisuals,
  };
}

function resolvePrePublishTrueHoleRepairPassLimit(
  preparedFrame: RetainedContentTexturePagePreparedFrame,
): number {
  return Math.max(
    MIN_PRE_PUBLISH_TRUE_HOLE_REPAIR_PASSES,
    preparedFrame.replacementDescriptors.length * 2 +
      preparedFrame.trueHoleRectCount * 2,
  );
}

function createGpuFlowRetainedTrueHoleRepairPreparedFrame(
  preparedFrame: RetainedContentTexturePagePreparedFrame,
): RetainedContentTexturePagePreparedFrame {
  const replacementDescriptors = preparedFrame.replacementDescriptors.filter(
    ({ replacementRequest }) => replacementRequest.reason === "true-hole",
  );
  const refinementDescriptors = replacementDescriptors.map(
    ({ descriptor }) => descriptor,
  );
  return {
    ...preparedFrame,
    refinementDescriptors,
    refinementPageCount: refinementDescriptors.length,
    replacementDescriptors,
  };
}

function didRetainedTrueHoleRepairProgress({
  currentTrueHoleAreaCssPx,
  currentTrueHoleRectCount,
  repairedTrueHoleAreaCssPx,
  repairedTrueHoleRectCount,
}: {
  readonly currentTrueHoleAreaCssPx: number;
  readonly currentTrueHoleRectCount: number;
  readonly repairedTrueHoleAreaCssPx: number;
  readonly repairedTrueHoleRectCount: number;
}): boolean {
  if (repairedTrueHoleRectCount < currentTrueHoleRectCount) {
    return true;
  }
  return (
    repairedTrueHoleAreaCssPx <
    currentTrueHoleAreaCssPx - TRUE_HOLE_REPAIR_AREA_EPSILON_CSS_PX
  );
}

function retainedTrueHoleAreaCssPx(
  preparedFrame: RetainedContentTexturePagePreparedFrame,
): number {
  return preparedFrame.trueHoleRectsCss.reduce(
    (total, rect) => total + rect.width * rect.height,
    0,
  );
}

function createRetainedPrePublishRepairNoProgressError({
  currentPreparedFrame,
  currentTrueHoleAreaCssPx,
  pass,
  repairedFrame,
  repairedTrueHoleAreaCssPx,
}: {
  readonly currentPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly currentTrueHoleAreaCssPx: number;
  readonly pass: GpuFlowRetainedPageMaintenanceRun;
  readonly repairedFrame: RetainedContentTexturePagePreparedFrame;
  readonly repairedTrueHoleAreaCssPx: number;
}): Error {
  const firstReplacement = currentPreparedFrame.replacementDescriptors[0];
  const firstRejected = repairedFrame.rejectedStaleRects[0];
  const firstTarget = currentPreparedFrame.visibleRegionTargets[0];
  const firstTrueHole = currentPreparedFrame.trueHoleRectsCss[0];
  const budgetDiagnostic = pass.result.diagnostics[0];
  const details = [
    ...createRetainedNoProgressFrameDebugDetails({
      currentPreparedFrame,
      currentTrueHoleAreaCssPx,
      repairedFrame,
      repairedTrueHoleAreaCssPx,
    }),
    ...createRetainedMaintenanceResultDebugDetails(pass.result),
    `replacements=${currentPreparedFrame.replacementDescriptors.length}`,
    formatTrueHoleDebug(firstTrueHole),
    formatReplacementDebug("first", firstReplacement),
    formatReplacementRequestDebug(firstReplacement),
    formatRegionTargetDebug("target", firstTarget),
    formatRejectedRectDebug(firstRejected),
    formatBudgetDiagnosticDebug(budgetDiagnostic),
  ];
  return new Error(
    `Retained deterministic visible base coverage did not make pre-publish repair progress (${details.join(", ")}).`,
  );
}

function createRetainedPrePublishRepairPassLimitError({
  aggregate,
  currentPreparedFrame,
  maxPassCount,
  passCount,
}: {
  readonly aggregate: RetainedContentTexturePageMaintenanceResult | null;
  readonly currentPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly maxPassCount: number;
  readonly passCount: number;
}): Error {
  const firstReplacement = currentPreparedFrame.replacementDescriptors.find(
    ({ replacementRequest }) => replacementRequest.reason === "true-hole",
  );
  const firstRejected = currentPreparedFrame.rejectedStaleRects[0];
  const firstTarget = currentPreparedFrame.visibleRegionTargets[0];
  const firstTrueHole = currentPreparedFrame.trueHoleRectsCss[0];
  const details = [
    `passes=${passCount}/${maxPassCount}`,
    ...createRetainedCurrentFrameDebugDetails({
      frame: currentPreparedFrame,
      trueHoleAreaCssPx: retainedTrueHoleAreaCssPx(currentPreparedFrame),
    }),
    ...createRetainedAggregateDebugDetails(aggregate),
    `replacements=${currentPreparedFrame.replacementDescriptors.length}`,
    formatTrueHoleDebug(firstTrueHole),
    formatReplacementDebug("first", firstReplacement),
    formatReplacementRequestDebug(firstReplacement),
    formatRegionTargetDebug("target", firstTarget),
    formatRejectedRectDebug(firstRejected),
  ];
  return new Error(
    `Retained deterministic visible base coverage exceeded the pre-publish repair pass limit (${details.join(", ")}).`,
  );
}

function createRetainedNoProgressFrameDebugDetails({
  currentPreparedFrame,
  currentTrueHoleAreaCssPx,
  repairedFrame,
  repairedTrueHoleAreaCssPx,
}: {
  readonly currentPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly currentTrueHoleAreaCssPx: number;
  readonly repairedFrame: RetainedContentTexturePagePreparedFrame;
  readonly repairedTrueHoleAreaCssPx: number;
}): readonly string[] {
  return [
    `holes=${currentPreparedFrame.trueHoleRectCount}->${repairedFrame.trueHoleRectCount}`,
    `area=${currentTrueHoleAreaCssPx}->${repairedTrueHoleAreaCssPx}`,
    `candidates=${currentPreparedFrame.coverageCandidateCount}->${repairedFrame.coverageCandidateCount}`,
    `draw=${currentPreparedFrame.drawQuadCount}->${repairedFrame.drawQuadCount}`,
    `compatible=${currentPreparedFrame.compatibleDrawQuadCount}->${repairedFrame.compatibleDrawQuadCount}`,
    `rejectedCount=${currentPreparedFrame.rejectedStaleRectCount}->${repairedFrame.rejectedStaleRectCount}`,
    formatRejectedReasonsDebug(currentPreparedFrame),
  ];
}

function createRetainedCurrentFrameDebugDetails({
  frame,
  trueHoleAreaCssPx,
}: {
  readonly frame: RetainedContentTexturePagePreparedFrame;
  readonly trueHoleAreaCssPx: number;
}): readonly string[] {
  return [
    `holes=${frame.trueHoleRectCount}`,
    `area=${trueHoleAreaCssPx}`,
    `candidates=${frame.coverageCandidateCount}`,
    `draw=${frame.drawQuadCount}`,
    `compatible=${frame.compatibleDrawQuadCount}`,
    `rejectedCount=${frame.rejectedStaleRectCount}`,
    formatRejectedReasonsDebug(frame),
  ];
}

function createRetainedMaintenanceResultDebugDetails(
  result: RetainedContentTexturePageMaintenanceResult,
): readonly string[] {
  return [
    `queued=${result.queuedWorkCountBeforeUpload}->${result.queuedWorkCount}`,
    `uploadable=${result.remainingUploadableWorkCount}`,
    `executed=${result.executedItemCount}`,
    `uploads=${result.uploadCount}`,
    `bytes=${result.uploadedBytes}`,
  ];
}

function createRetainedAggregateDebugDetails(
  aggregate: RetainedContentTexturePageMaintenanceResult | null,
): readonly string[] {
  if (!aggregate) {
    return [
      "queued=0",
      "uploadable=0",
      "executed=0",
      "uploads=0",
      "bytes=0",
    ];
  }
  return [
    `queued=${aggregate.queuedWorkCount}`,
    `uploadable=${aggregate.remainingUploadableWorkCount}`,
    `executed=${aggregate.executedItemCount}`,
    `uploads=${aggregate.uploadCount}`,
    `bytes=${aggregate.uploadedBytes}`,
  ];
}

function formatRejectedReasonsDebug(
  frame: RetainedContentTexturePagePreparedFrame,
): string {
  return `rejectedReasons=${JSON.stringify(frame.coveragePlan.proof.rejectedCoverageCountByReason)}`;
}

function formatTrueHoleDebug(
  rect:
    | RetainedContentTexturePagePreparedFrame["trueHoleRectsCss"][number]
    | undefined,
): string {
  return rect ? `hole=${rectDebugKey(rect)}` : "hole=none";
}

function formatReplacementDebug(
  label: string,
  replacement:
    | RetainedContentTexturePagePreparedFrame["replacementDescriptors"][number]
    | undefined,
): string {
  if (!replacement) {
    return `${label}=none`;
  }
  const descriptor = replacement.descriptor;
  return `${label}=${descriptor.surfaceId}:${descriptor.visualEpochKind ?? "base"}:${descriptor.contentVersion}:${descriptor.sourceVersion}:${descriptor.sourceRectCss.x}:${descriptor.sourceRectCss.y}:${descriptor.sourceRectCss.width}:${descriptor.sourceRectCss.height}:${replacement.replacementRequest.reason}:segments=${descriptor.contentSegments?.length ?? 0}:snapshots=${descriptor.textLikeSnapshots?.length ?? 0}`;
}

function formatReplacementRequestDebug(
  replacement:
    | RetainedContentTexturePagePreparedFrame["replacementDescriptors"][number]
    | undefined,
): string {
  if (!replacement) {
    return "request=none";
  }
  return formatRegionTargetDebug(
    "request",
    replacement.replacementRequest.target,
  );
}

function formatRegionTargetDebug(
  label: string,
  target:
    | RetainedContentTexturePagePreparedFrame["visibleRegionTargets"][number]
    | undefined,
): string {
  if (!target) {
    return `${label}=none`;
  }
  return `${label}=${target.manifest.surfaceId}:${target.manifest.visualEpochKind ?? "base"}:${target.manifest.contentVersion}:${target.manifest.themeGeneration}:${target.contentRect.x}:${target.contentRect.y}:${target.contentRect.width}:${target.contentRect.height}:segments=${target.manifest.contentSegments?.length ?? 0}:snapshots=${target.manifest.textLikeSnapshots?.length ?? 0}:z=${target.zLayer}`;
}

function formatRejectedRectDebug(
  rejected:
    | RetainedContentTexturePagePreparedFrame["rejectedStaleRects"][number]
    | undefined,
): string {
  if (!rejected) {
    return "rejected=none";
  }
  return `rejected=${rejected.reason}@${rectDebugKey(rejected.rect)}`;
}

function formatBudgetDiagnosticDebug(
  diagnostic:
    | RetainedContentTexturePageMaintenanceResult["diagnostics"][number]
    | undefined,
): string {
  if (!diagnostic) {
    return "budget=none";
  }
  return `budget=${diagnostic.reason}:${diagnostic.item.surfaceId}:${diagnostic.item.kind}:${diagnostic.item.visualEpochKind ?? "base"}`;
}

function rectDebugKey({
  height,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}): string {
  return `${x}:${y}:${width}:${height}`;
}

export function assertGpuFlowRetainedPreparedFrameHasNoTrueHoles({
  preparedFrame,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
}) {
  if (preparedFrame.trueHoleRectCount === 0) {
    return;
  }
  throw new Error(
    `Retained display publication requires complete deterministic base coverage; ${preparedFrame.trueHoleRectCount} true-hole rects remained.`,
  );
}

export function resolveGpuFlowRetainedPageMaintenanceAfterPublish({
  darkMode,
  deferResolutionUpdates,
  existingMaintenance,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
  textLikeSnapshotElementById,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly existingMaintenance: GpuFlowRetainedPageMaintenanceRun | null;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
}): GpuFlowRetainedPageMaintenanceRun {
  return (
    existingMaintenance ??
    runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
      preparedFrame,
      publishedProtectedPageKeys,
      retainedContentPageManager,
      textLikeSnapshotElementById,
    })
  );
}
