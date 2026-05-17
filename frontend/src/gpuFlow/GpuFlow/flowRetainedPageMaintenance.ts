import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

type GpuFlowRetainedPageMaintenanceRun = ReturnType<
  typeof runGpuFlowRetainedPageMaintenance
>;

const MAX_PRE_PUBLISH_REPAIR_PASSES = 4;

export function shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
  deferResolutionUpdates,
  preparedFrame,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "replacementDescriptors" | "trueHoleRectCount"
  >;
}): boolean {
  return deferResolutionUpdates && preparedFrame.trueHoleRectCount === 0;
}

export function hasGpuFlowRetainedPreparedFramePrePublishRepairDebt(
  preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "refinementPageCount" | "replacementDescriptors" | "trueHoleRectCount"
  >,
): boolean {
  return (
    preparedFrame.trueHoleRectCount > 0 ||
    preparedFrame.replacementDescriptors.length > 0 ||
    preparedFrame.refinementPageCount > 0
  );
}

function runGpuFlowRetainedPageMaintenance({
  darkMode,
  deferResolutionUpdates,
  forceDeferPostSubmitMaintenance = false,
  forceRunPostSubmitMaintenance = false,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
  refreshFirstVisiblePages = false,
  preserveFirstVisibleSourceRects = false,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly forceDeferPostSubmitMaintenance?: boolean | undefined;
  readonly forceRunPostSubmitMaintenance?: boolean | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
  readonly preserveFirstVisibleSourceRects?: boolean | undefined;
  readonly refreshFirstVisiblePages?: boolean | undefined;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): {
  readonly deferred: boolean;
  readonly result: RetainedContentTexturePageMaintenanceResult;
} {
  const deferred =
    !forceRunPostSubmitMaintenance &&
    (forceDeferPostSubmitMaintenance ||
      shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
        deferResolutionUpdates,
        preparedFrame,
      }));
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
        viewportInteractionActive: deferResolutionUpdates,
      });
  return { deferred, result };
}

export function resolveGpuFlowRetainedPageMaintenanceBeforePublish({
  darkMode,
  deferResolutionUpdates,
  maxPasses = MAX_PRE_PUBLISH_REPAIR_PASSES,
  preparedFrame,
  previousProtectedPageKeys,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly maxPasses?: number | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): GpuFlowRetainedPageMaintenanceRun | null {
  let currentFrame = preparedFrame;
  let maintenance: GpuFlowRetainedPageMaintenanceRun | null = null;
  const repairPassCount = Math.max(0, Math.floor(maxPasses));
  for (
    let pass = 0;
    pass < repairPassCount &&
    shouldRepairGpuFlowRetainedPreparedFrameBeforePublish(currentFrame);
    pass += 1
  ) {
    const nextMaintenance = runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
      forceRunPostSubmitMaintenance: true,
      preparedFrame: currentFrame,
      publishedProtectedPageKeys: previousProtectedPageKeys,
      retainedContentPageManager,
    });
    maintenance = nextMaintenance;
    currentFrame = nextMaintenance.result.repairedPreparedFrame;
    if (!didGpuFlowRetainedPageMaintenanceAdvance(nextMaintenance)) {
      break;
    }
  }
  return maintenance;
}

function shouldRepairGpuFlowRetainedPreparedFrameBeforePublish(
  preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "refinementPageCount" | "replacementDescriptors" | "trueHoleRectCount"
  >,
): boolean {
  return hasGpuFlowRetainedPreparedFramePrePublishRepairDebt(preparedFrame);
}

export function resolveGpuFlowRetainedPageMaintenanceAfterPublish({
  darkMode,
  deferResolutionUpdates,
  existingMaintenance,
  forceDeferPostSubmitMaintenance = false,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly existingMaintenance: GpuFlowRetainedPageMaintenanceRun | null;
  readonly forceDeferPostSubmitMaintenance?: boolean | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): GpuFlowRetainedPageMaintenanceRun {
  return (
    existingMaintenance ??
    runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
      forceDeferPostSubmitMaintenance,
      preparedFrame,
      publishedProtectedPageKeys,
      retainedContentPageManager,
    })
  );
}

function didGpuFlowRetainedPageMaintenanceAdvance(
  maintenance: GpuFlowRetainedPageMaintenanceRun,
): boolean {
  return (
    maintenance.result.executedItemCount > 0 ||
    maintenance.result.uploadCount > 0
  );
}
