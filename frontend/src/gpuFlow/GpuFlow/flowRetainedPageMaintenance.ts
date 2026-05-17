import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";

type GpuFlowRetainedPageMaintenanceRun = ReturnType<
  typeof runGpuFlowRetainedPageMaintenance
>;
const MAX_INTERACTION_VISIBLE_SNAPSHOT_EXACT_REPLACEMENTS = 8;

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
  return (
    deferResolutionUpdates &&
    preparedFrame.trueHoleRectCount === 0 &&
    !hasVisibleSnapshotExactReplacement(preparedFrame)
  );
}

function hasVisibleSnapshotExactReplacement(
  preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "replacementDescriptors"
  >,
): boolean {
  let replacementCount = 0;
  for (const {
    descriptor,
    replacementRequest,
  } of preparedFrame.replacementDescriptors) {
    if (
      descriptor.visualEpochKind !== "snapshot-exact" ||
      replacementRequest.priority !== "visible-refinement"
    ) {
      continue;
    }
    replacementCount += 1;
    if (
      replacementCount > MAX_INTERACTION_VISIBLE_SNAPSHOT_EXACT_REPLACEMENTS
    ) {
      return false;
    }
  }
  return replacementCount > 0;
}

function runGpuFlowRetainedPageMaintenance({
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
