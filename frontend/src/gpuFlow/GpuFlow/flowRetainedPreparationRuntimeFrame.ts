import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuRect } from "../viewportMath";

const RETAINED_PREPARATION_SNAPSHOT_DESCRIPTOR_LIMIT = 12;
const RETAINED_PREPARATION_SNAPSHOT_SOURCE_LIMIT = 48;

export function createGpuFlowRetainedPreparationRuntimeFrame({
  preparedFrame,
  retainedRuntimeFrame,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuRetainedRuntimeFrame {
  const sources = retainedRuntimeFrame.descriptors.textLikeRowSnapshotSources;
  if (
    !shouldFilterRetainedPreparationSnapshotSources({
      preparedFrame,
      sourceCount: sources.length,
    })
  ) {
    return retainedRuntimeFrame;
  }
  const selectedSourceIds = collectRetainedPreparationSnapshotSourceIds({
    preparedFrame,
    sources,
  });
  const textLikeRowSnapshotSources = sources.filter((source) =>
    selectedSourceIds.has(source.sourceId),
  );
  if (textLikeRowSnapshotSources.length === sources.length) {
    return retainedRuntimeFrame;
  }
  return Object.freeze({
    ...retainedRuntimeFrame,
    descriptors: Object.freeze({
      ...retainedRuntimeFrame.descriptors,
      textLikeRowSnapshotSources: Object.freeze(textLikeRowSnapshotSources),
    }),
    diagnostics: Object.freeze({
      ...retainedRuntimeFrame.diagnostics,
      textLikeSnapshotSourceCount: textLikeRowSnapshotSources.length,
    }),
  });
}

function shouldFilterRetainedPreparationSnapshotSources({
  preparedFrame,
  sourceCount,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly sourceCount: number;
}): boolean {
  return (
    (preparedFrame.refinementDescriptors.length > 0 ||
      preparedFrame.trueHoleRectCount > 0) &&
    sourceCount > RETAINED_PREPARATION_SNAPSHOT_SOURCE_LIMIT
  );
}

function collectRetainedPreparationSnapshotSourceIds({
  preparedFrame,
  sources,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly sources: GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"];
}): Set<string> {
  const selectedSourceIds = new Set<string>();
  for (const descriptor of preparedFrame.refinementDescriptors.slice(
    0,
    RETAINED_PREPARATION_SNAPSHOT_DESCRIPTOR_LIMIT,
  )) {
    const matchedDescriptor = collectRetainedPreparationDescriptorSourceIds({
      descriptor,
      selectedSourceIds,
      sources,
    });
    if (
      matchedDescriptor &&
      selectedSourceIds.size >= RETAINED_PREPARATION_SNAPSHOT_SOURCE_LIMIT
    ) {
      break;
    }
  }
  return selectedSourceIds;
}

function collectRetainedPreparationDescriptorSourceIds({
  descriptor,
  selectedSourceIds,
  sources,
}: {
  readonly descriptor: RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number];
  readonly selectedSourceIds: Set<string>;
  readonly sources: GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"];
}): boolean {
  let matchedDescriptor = false;
  for (const source of sources) {
    if (!isRetainedPreparationSnapshotSourceForDescriptor(source, descriptor)) {
      continue;
    }
    selectedSourceIds.add(source.sourceId);
    matchedDescriptor = true;
  }
  return matchedDescriptor;
}

function isRetainedPreparationSnapshotSourceForDescriptor(
  source: GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"][number],
  descriptor: RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number],
): boolean {
  return (
    source.surfaceId === descriptor.surfaceId &&
    rectsIntersect(source.targetRectCss, descriptor.sourceRectCss)
  );
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
