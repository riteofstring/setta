import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

type GpuFlowRetainedPageMaintenanceRun = ReturnType<
  typeof runGpuFlowRetainedPageMaintenance
>;

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
