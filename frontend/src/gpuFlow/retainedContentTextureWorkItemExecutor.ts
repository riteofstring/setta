import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import {
  isRetainedTextureWorkItemCompleteAfterPageUpload,
  shouldEnqueueRemainingRefreshDescriptors,
  shouldUploadRetainedTexturePage,
} from "./retainedContentTexturePageManagerHelpers";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManagerTypes";
import { areRetainedContentTexturePageTextLikeSnapshotsReady } from "./retainedContentTexturePageTextLikeSnapshots";
import {
  RetainedTexturePageCache,
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { RetainedTextureWorkItem } from "./retainedTextureWorkQueue";

export type RetainedTextureWorkExecutionResult = {
  readonly complete: boolean;
  readonly rasterMs: number;
  readonly uploadCount: number;
  readonly uploadedBytes: number;
  readonly uploadMs: number;
};

type RetainedTextureWorkDescriptorUploadOutcome = {
  readonly continueWorkItem: boolean;
  readonly pageUploadComplete: boolean;
  readonly result: RetainedTextureWorkExecutionResult;
};

const EMPTY_RETAINED_TEXTURE_WORK_RESULT: RetainedTextureWorkExecutionResult = {
  complete: true,
  rasterMs: 0,
  uploadCount: 0,
  uploadedBytes: 0,
  uploadMs: 0,
};

export function executeRetainedContentTextureWorkItem({
  cache,
  clearSnapshotExactUnavailableState,
  enqueueDescriptorWork,
  frame,
  frameSurfaceById,
  item,
  palette,
  resolveSnapshotExactUnavailableResult,
  resolveWorkItemDescriptors,
  snapshotUnavailablePageKeys,
  switchAnimations,
  textLikeSnapshotElementById,
  uploadPage,
}: {
  readonly cache: RetainedTexturePageCache;
  readonly clearSnapshotExactUnavailableState: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly descriptorKey: string;
  }) => void;
  readonly enqueueDescriptorWork: (input: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
    readonly kind: RetainedTextureWorkItem["kind"];
    readonly priority: RetainedTextureWorkItem["priority"];
    readonly refreshCommittedPage?: boolean | undefined;
    readonly targetLod?: number | undefined;
  }) => void;
  readonly frame: number;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly item: RetainedTextureWorkItem;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly resolveSnapshotExactUnavailableResult: (
    descriptor: RetainedTexturePageDescriptor,
  ) => RetainedTextureWorkExecutionResult;
  readonly resolveWorkItemDescriptors: (
    item: RetainedTextureWorkItem,
  ) => readonly RetainedTexturePageDescriptor[];
  readonly snapshotUnavailablePageKeys: ReadonlySet<string>;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly elementByTextLikeSnapshotSourceId: ReadonlyMap<
      string,
      HTMLElement
    >;
    readonly frame: number;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }) => RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkExecutionResult {
  const descriptors = resolveWorkItemDescriptors(item);
  const descriptor = descriptors[0];
  if (!descriptor) {
    return EMPTY_RETAINED_TEXTURE_WORK_RESULT;
  }

  const uploadOutcome = executeDescriptorUploadForWorkItem({
    cache,
    clearSnapshotExactUnavailableState,
    descriptor,
    frame,
    frameSurfaceById,
    item,
    palette,
    resolveSnapshotExactUnavailableResult,
    snapshotUnavailablePageKeys,
    switchAnimations,
    textLikeSnapshotElementById,
    uploadPage,
  });
  if (!uploadOutcome.continueWorkItem) {
    return uploadOutcome.result;
  }
  enqueueRemainingRefreshDescriptorsAfterUpload({
    descriptors,
    enqueueDescriptorWork,
    frame,
    item,
    pageUploadComplete: uploadOutcome.pageUploadComplete,
  });
  return createRetainedTextureWorkExecutionResult({
    descriptorCount: descriptors.length,
    item,
    pageUploadComplete: uploadOutcome.pageUploadComplete,
    uploadResult: uploadOutcome.result,
  });
}

function executeDescriptorUploadForWorkItem({
  cache,
  clearSnapshotExactUnavailableState,
  descriptor,
  frame,
  frameSurfaceById,
  item,
  palette,
  resolveSnapshotExactUnavailableResult,
  snapshotUnavailablePageKeys,
  switchAnimations,
  textLikeSnapshotElementById,
  uploadPage,
}: {
  readonly cache: RetainedTexturePageCache;
  readonly clearSnapshotExactUnavailableState: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly descriptorKey: string;
  }) => void;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly frame: number;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly item: RetainedTextureWorkItem;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly resolveSnapshotExactUnavailableResult: (
    descriptor: RetainedTexturePageDescriptor,
  ) => RetainedTextureWorkExecutionResult;
  readonly snapshotUnavailablePageKeys: ReadonlySet<string>;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly elementByTextLikeSnapshotSourceId: ReadonlyMap<
      string,
      HTMLElement
    >;
    readonly frame: number;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }) => RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkDescriptorUploadOutcome {
  const committedPagePresent = Boolean(
    cache.getCommittedPage(retainedTexturePageKey(descriptor)),
  );
  if (!shouldUploadRetainedTexturePage({ committedPagePresent, item })) {
    return createContinuingDescriptorUploadOutcome({
      pageUploadComplete: true,
      result: EMPTY_RETAINED_TEXTURE_WORK_RESULT,
    });
  }
  return executeRequiredDescriptorUploadForWorkItem({
    clearSnapshotExactUnavailableState,
    descriptor,
    frame,
    frameSurfaceById,
    palette,
    resolveSnapshotExactUnavailableResult,
    snapshotUnavailablePageKeys,
    switchAnimations,
    textLikeSnapshotElementById,
    uploadPage,
  });
}

function executeRequiredDescriptorUploadForWorkItem({
  clearSnapshotExactUnavailableState,
  descriptor,
  frame,
  frameSurfaceById,
  palette,
  resolveSnapshotExactUnavailableResult,
  snapshotUnavailablePageKeys,
  switchAnimations,
  textLikeSnapshotElementById,
  uploadPage,
}: {
  readonly clearSnapshotExactUnavailableState: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly descriptorKey: string;
  }) => void;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly frame: number;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly resolveSnapshotExactUnavailableResult: (
    descriptor: RetainedTexturePageDescriptor,
  ) => RetainedTextureWorkExecutionResult;
  readonly snapshotUnavailablePageKeys: ReadonlySet<string>;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly elementByTextLikeSnapshotSourceId: ReadonlyMap<
      string,
      HTMLElement
    >;
    readonly frame: number;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }) => RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkDescriptorUploadOutcome {
  const descriptorKey = retainedTexturePageKey(descriptor);
  if (snapshotUnavailablePageKeys.has(descriptorKey)) {
    return createStoppedDescriptorUploadOutcome(
      EMPTY_RETAINED_TEXTURE_WORK_RESULT,
    );
  }
  if (
    !isSnapshotExactDescriptorReady({
      descriptor,
      frameSurfaceById,
      textLikeSnapshotElementById,
    })
  ) {
    return createStoppedDescriptorUploadOutcome(
      resolveSnapshotExactUnavailableResult(descriptor),
    );
  }

  const upload = uploadPage({
    descriptor,
    elementByTextLikeSnapshotSourceId: textLikeSnapshotElementById,
    frame,
    palette,
    switchAnimations,
  });
  if (upload.complete) {
    clearSnapshotExactUnavailableState({ descriptor, descriptorKey });
    return createContinuingDescriptorUploadOutcome({
      pageUploadComplete: true,
      result: upload,
    });
  }
  if (descriptor.visualEpochKind === "snapshot-exact") {
    return createStoppedDescriptorUploadOutcome({
      ...resolveSnapshotExactUnavailableResult(descriptor),
      rasterMs: upload.rasterMs,
      uploadMs: upload.uploadMs,
    });
  }
  return createContinuingDescriptorUploadOutcome({
    pageUploadComplete: false,
    result: upload,
  });
}

function isSnapshotExactDescriptorReady({
  descriptor,
  frameSurfaceById,
  textLikeSnapshotElementById,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
}): boolean {
  return (
    descriptor.visualEpochKind !== "snapshot-exact" ||
    areRetainedContentTexturePageTextLikeSnapshotsReady({
      descriptor,
      elementBySourceId: textLikeSnapshotElementById,
      surface: frameSurfaceById.get(descriptor.surfaceId),
    })
  );
}

function enqueueRemainingRefreshDescriptorsAfterUpload({
  descriptors,
  enqueueDescriptorWork,
  frame,
  item,
  pageUploadComplete,
}: {
  readonly descriptors: readonly RetainedTexturePageDescriptor[];
  readonly enqueueDescriptorWork: (input: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
    readonly kind: RetainedTextureWorkItem["kind"];
    readonly priority: RetainedTextureWorkItem["priority"];
    readonly refreshCommittedPage?: boolean | undefined;
    readonly targetLod?: number | undefined;
  }) => void;
  readonly frame: number;
  readonly item: RetainedTextureWorkItem;
  readonly pageUploadComplete: boolean;
}) {
  if (
    shouldEnqueueRemainingRefreshDescriptors({
      descriptorCount: descriptors.length,
      item,
      pageUploadComplete,
    })
  ) {
    enqueueDescriptorWork({
      descriptors: descriptors.slice(1),
      frame,
      kind: item.kind,
      priority: item.priority,
      refreshCommittedPage: item.refreshCommittedPage,
      ...(item.targetLod === undefined ? {} : { targetLod: item.targetLod }),
    });
  }
}

function createRetainedTextureWorkExecutionResult({
  descriptorCount,
  item,
  pageUploadComplete,
  uploadResult,
}: {
  readonly descriptorCount: number;
  readonly item: RetainedTextureWorkItem;
  readonly pageUploadComplete: boolean;
  readonly uploadResult: RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkExecutionResult {
  return {
    ...uploadResult,
    complete: isRetainedTextureWorkItemCompleteAfterPageUpload({
      descriptorCount,
      item,
      pageUploadComplete,
    }),
  };
}

function createContinuingDescriptorUploadOutcome({
  pageUploadComplete,
  result,
}: {
  readonly pageUploadComplete: boolean;
  readonly result: RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkDescriptorUploadOutcome {
  return {
    continueWorkItem: true,
    pageUploadComplete,
    result,
  };
}

function createStoppedDescriptorUploadOutcome(
  result: RetainedTextureWorkExecutionResult,
): RetainedTextureWorkDescriptorUploadOutcome {
  return {
    continueWorkItem: false,
    pageUploadComplete: false,
    result,
  };
}
