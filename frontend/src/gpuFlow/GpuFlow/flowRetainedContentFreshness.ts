import {
  getGpuRetainedContentSourceRectForRows,
  type GpuRetainedContentSourceSurface,
} from "../GpuRetainedContentSurfaces";
import { createGpuRetainedContentSampledSceneForSurface } from "../retainedContentRuntimeSampling";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { GpuContentSurface } from "../scene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

export function markGpuFlowRetainedContentFrameFreshnessDirty({
  deferResolutionUpdates,
  frame,
  retainedContentPageManager,
  rowHoverTarget,
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly rowHoverTarget: GpuFlowNodeLayerState["retainedContentRowHoverTarget"];
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  if (!deferResolutionUpdates) {
    markGpuFlowRetainedContentRowHoverFreshnessDirty({
      frame,
      retainedContentPageManager,
      rowHoverTarget,
      scrollOffsets,
      sourceSurfaces,
    });
  }
  markGpuFlowRetainedContentSwitchFreshnessDirty({
    frame,
    retainedContentPageManager,
    scrollOffsets,
    sourceSurfaces,
    switchAnimations,
  });
}

export function settleGpuFlowRetainedContentFrameSwitchAnimationSurfaces({
  deferRetainedPageMaintenance,
  nowMs,
  retainedContentPageManager,
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly deferRetainedPageMaintenance: boolean;
  readonly nowMs: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  if (deferRetainedPageMaintenance) {
    return;
  }
  settleGpuFlowRetainedContentCompletedSwitchAnimationSurfaces({
    nowMs,
    retainedContentPageManager,
    scrollOffsets,
    sourceSurfaces,
    switchAnimations,
  });
}

function markGpuFlowRetainedContentRowHoverFreshnessDirty({
  frame,
  retainedContentPageManager,
  rowHoverTarget,
  scrollOffsets,
  sourceSurfaces,
}: {
  readonly frame: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly rowHoverTarget: GpuFlowNodeLayerState["retainedContentRowHoverTarget"];
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
}) {
  if (!rowHoverTarget) {
    return;
  }
  const surface = sourceSurfaces.find(
    (candidate) => candidate.id === rowHoverTarget.surfaceId,
  );
  if (!surface) {
    return;
  }
  const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
    scrollOffsets,
    surface,
  });
  const sourceRect = getGpuRetainedContentSourceRectForRows({
    rowIds: [rowHoverTarget.rowId],
    surface: sampledSurface,
  });
  if (!sourceRect) {
    return;
  }
  if (
    retainedContentPageManager.hasFreshSurfaceContentForRect({
      sourceRect,
      surfaceId: rowHoverTarget.surfaceId,
    })
  ) {
    return;
  }
  retainedContentPageManager.markSurfaceContentDirty({
    frame,
    priority: "interactive",
    sourceRect,
    surfaceId: rowHoverTarget.surfaceId,
  });
}

function markGpuFlowRetainedContentSwitchFreshnessDirty({
  frame,
  retainedContentPageManager,
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly frame: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
      scrollOffsets,
      surface,
    });
    const sourceRect = getGpuRetainedContentSourceRectForRows({
      rowIds:
        switchAnimations.getFreshnessProtectedSurfaceRowIds(sampledSurface),
      surface: sampledSurface,
    });
    if (!sourceRect) {
      continue;
    }
    if (
      retainedContentPageManager.hasFreshSurfaceContentForRect({
        sourceRect,
        surfaceId: surface.id,
      })
    ) {
      continue;
    }
    retainedContentPageManager.markSurfaceContentDirty({
      frame,
      priority: "interactive",
      sourceRect,
      surfaceId: surface.id,
    });
  }
}

function settleGpuFlowRetainedContentCompletedSwitchAnimationSurfaces({
  nowMs,
  retainedContentPageManager,
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
      scrollOffsets,
      surface,
    });
    switchAnimations.settleCompletedSurfaceTransitions({
      isRowFresh: (rowId) => {
        const sourceRect = getGpuRetainedContentSourceRectForRows({
          rowIds: [rowId],
          surface: sampledSurface,
        });
        return sourceRect
          ? retainedContentPageManager.hasFreshSurfaceContentForRect({
              sourceRect,
              surfaceId: sampledSurface.id,
            })
          : true;
      },
      nowMs,
      surface: sampledSurface,
    });
  }
}

export function sampleGpuFlowRetainedContentSwitchAnimationSurface<
  TSurface extends GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  },
>({
  scrollOffsets,
  surface,
}: {
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surface: TSurface;
}): TSurface {
  return {
    ...surface,
    retainedScene: createGpuRetainedContentSampledSceneForSurface({
      scrollOffsets,
      surface,
    }),
  };
}
