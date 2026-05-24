import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import {
  isRetainedTextureWorkItemCompleteAfterPageUpload,
  shouldEnqueueRemainingRefreshDescriptors,
  shouldUploadRetainedTexturePage,
} from "./retainedContentTexturePageManagerHelpers";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
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
  enqueueDescriptorWork,
  frame,
  item,
  palette,
  resolveWorkItemDescriptors,
  switchAnimations,
  uploadPage,
}: {
  readonly cache: RetainedTexturePageCache<RetainedContentTextureResources>;
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
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly resolveWorkItemDescriptors: (
    item: RetainedTextureWorkItem,
  ) => readonly RetainedTexturePageDescriptor[];
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
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
    descriptor,
    frame,
    item,
    palette,
    switchAnimations,
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
  descriptor,
  frame,
  item,
  palette,
  switchAnimations,
  uploadPage,
}: {
  readonly cache: RetainedTexturePageCache<RetainedContentTextureResources>;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly frame: number;
  readonly item: RetainedTextureWorkItem;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
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
    descriptor,
    frame,
    palette,
    switchAnimations,
    uploadPage,
  });
}

function executeRequiredDescriptorUploadForWorkItem({
  descriptor,
  frame,
  palette,
  switchAnimations,
  uploadPage,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly frame: number;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly uploadPage: (input: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }) => RetainedTextureWorkExecutionResult;
}): RetainedTextureWorkDescriptorUploadOutcome {
  const upload = uploadPage({
    descriptor,
    frame,
    palette,
    switchAnimations,
  });
  if (upload.complete) {
    return createContinuingDescriptorUploadOutcome({
      pageUploadComplete: true,
      result: upload,
    });
  }
  return createContinuingDescriptorUploadOutcome({
    pageUploadComplete: false,
    result: upload,
  });
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
