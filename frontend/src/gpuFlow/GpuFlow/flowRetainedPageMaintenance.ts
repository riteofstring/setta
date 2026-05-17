import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

type GpuFlowRetainedPageMaintenanceRun = ReturnType<
  typeof runGpuFlowRetainedPageMaintenance
>;

const MAX_PRE_PUBLISH_TRUE_HOLE_REPAIR_PASSES = 2;

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

function runGpuFlowRetainedPageMaintenance({
  darkMode,
  deferResolutionUpdates,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
  refreshFirstVisiblePages = false,
  preserveFirstVisibleSourceRects = false,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
  readonly preserveFirstVisibleSourceRects?: boolean | undefined;
  readonly refreshFirstVisiblePages?: boolean | undefined;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
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
        viewportInteractionActive: deferResolutionUpdates,
      });
  return { deferred, result };
}

export function resolveGpuFlowRetainedPageMaintenanceBeforePublish({
  darkMode,
  deferResolutionUpdates,
  preparedFrame,
  previousProtectedPageKeys,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): GpuFlowRetainedPageMaintenanceRun | null {
  let currentFrame = preparedFrame;
  let maintenance: GpuFlowRetainedPageMaintenanceRun | null = null;
  for (
    let pass = 0;
    pass < MAX_PRE_PUBLISH_TRUE_HOLE_REPAIR_PASSES &&
    currentFrame.trueHoleRectCount > 0;
    pass += 1
  ) {
    const nextMaintenance = runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
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

export function resolveGpuFlowRetainedPageMaintenanceAfterPublish({
  darkMode,
  deferResolutionUpdates,
  existingMaintenance,
  preparedFrame,
  publishedProtectedPageKeys,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly existingMaintenance: GpuFlowRetainedPageMaintenanceRun | null;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): GpuFlowRetainedPageMaintenanceRun {
  return (
    existingMaintenance ??
    runGpuFlowRetainedPageMaintenance({
      darkMode,
      deferResolutionUpdates,
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
