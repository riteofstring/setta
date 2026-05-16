import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

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
  textLikeSnapshotElementById,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
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
        publishedProtectedPageKeys,
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
  return runGpuFlowRetainedPageMaintenance({
    darkMode,
    deferResolutionUpdates,
    preparedFrame,
    publishedProtectedPageKeys,
    retainedContentPageManager,
    textLikeSnapshotElementById,
  });
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
