import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

export function shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
  deferResolutionUpdates,
}: {
  readonly deferResolutionUpdates: boolean;
}): boolean {
  return deferResolutionUpdates;
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
