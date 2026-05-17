import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuRect } from "../viewportMath";

const RETAINED_PREPARATION_SNAPSHOT_DESCRIPTOR_LIMIT = 24;
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
  const contentPageSurfaces =
    filterRetainedPreparationContentPageSurfacesBySnapshotSources({
      retainedRuntimeFrame,
      selectedSourceIds,
    });
  return Object.freeze({
    ...retainedRuntimeFrame,
    descriptors: Object.freeze({
      ...retainedRuntimeFrame.descriptors,
      contentPageSurfaces,
      textLikeRowSnapshotSources: Object.freeze(textLikeRowSnapshotSources),
    }),
    diagnostics: Object.freeze({
      ...retainedRuntimeFrame.diagnostics,
      textLikeSnapshotSourceCount: textLikeRowSnapshotSources.length,
    }),
  });
}

function filterRetainedPreparationContentPageSurfacesBySnapshotSources({
  retainedRuntimeFrame,
  selectedSourceIds,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly selectedSourceIds: ReadonlySet<string>;
}): GpuRetainedRuntimeFrame["descriptors"]["contentPageSurfaces"] {
  let changed = false;
  const contentPageSurfaces =
    retainedRuntimeFrame.descriptors.contentPageSurfaces.map((surface) => {
      const textLikeSnapshots = surface.textLikeSnapshots ?? [];
      if (textLikeSnapshots.length === 0) {
        return surface;
      }
      const filteredTextLikeSnapshots = textLikeSnapshots.filter((snapshot) =>
        selectedSourceIds.has(snapshot.sourceId),
      );
      if (filteredTextLikeSnapshots.length === textLikeSnapshots.length) {
        return surface;
      }
      changed = true;
      return Object.freeze({
        ...surface,
        textLikeSnapshots: Object.freeze(filteredTextLikeSnapshots),
      });
    });
  return changed
    ? Object.freeze(contentPageSurfaces)
    : retainedRuntimeFrame.descriptors.contentPageSurfaces;
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
  const sourcesBySurfaceId =
    groupRetainedPreparationSnapshotSourcesBySurface(sources);
  collectRetainedPreparationVisibleSourceIds({
    preparedFrame,
    selectedSourceIds,
    sourcesBySurfaceId,
  });
  for (const descriptor of selectRetainedPreparationSnapshotDescriptors({
    preparedFrame,
  })) {
    const matchedDescriptor = collectRetainedPreparationDescriptorSourceIds({
      descriptor,
      selectedSourceIds,
      sources: sourcesBySurfaceId.get(descriptor.surfaceId) ?? [],
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

function collectRetainedPreparationVisibleSourceIds({
  preparedFrame,
  selectedSourceIds,
  sourcesBySurfaceId,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly selectedSourceIds: Set<string>;
  readonly sourcesBySurfaceId: Map<
    string,
    GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"]
  >;
}) {
  for (const target of preparedFrame.visibleRegionTargets) {
    const sources = sourcesBySurfaceId.get(target.manifest.surfaceId) ?? [];
    for (const source of sources) {
      if (!rectsIntersect(source.targetRectCss, target.contentRect)) {
        continue;
      }
      selectedSourceIds.add(source.sourceId);
    }
  }
}

function groupRetainedPreparationSnapshotSourcesBySurface(
  sources: GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"],
): Map<
  string,
  GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"]
> {
  const sourcesBySurfaceId = new Map<
    string,
    GpuRetainedRuntimeFrame["descriptors"]["textLikeRowSnapshotSources"][number][]
  >();
  for (const source of sources) {
    const surfaceSources = sourcesBySurfaceId.get(source.surfaceId) ?? [];
    surfaceSources.push(source);
    sourcesBySurfaceId.set(source.surfaceId, surfaceSources);
  }
  return sourcesBySurfaceId;
}

function selectRetainedPreparationSnapshotDescriptors({
  preparedFrame,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
}): readonly RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number][] {
  const descriptors = prepareRetainedPreparationSnapshotDescriptorCandidates({
    preparedFrame,
  });
  if (descriptors.length <= RETAINED_PREPARATION_SNAPSHOT_DESCRIPTOR_LIMIT) {
    return descriptors.map((candidate) => candidate.descriptor);
  }
  return descriptors
    .slice(0, RETAINED_PREPARATION_SNAPSHOT_DESCRIPTOR_LIMIT)
    .map((candidate) => candidate.descriptor);
}

function prepareRetainedPreparationSnapshotDescriptorCandidates({
  preparedFrame,
}: {
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
}): readonly {
  readonly descriptor: RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number];
  readonly priorityRank: number;
  readonly snapshotBlockSequence: number | null;
  readonly sourceArea: number;
  readonly sourceIndex: number;
}[] {
  const replacementDescriptors = preparedFrame.replacementDescriptors;
  const candidates =
    replacementDescriptors.length > 0
      ? replacementDescriptors.map(
          (
            {
              descriptor,
              replacementRequest,
              snapshotBlockSequence,
              snapshotRequired,
            },
            sourceIndex,
          ) => ({
            descriptor,
            priorityRank: snapshotRequired
              ? -1
              : replacementRequest.priority === "visible-hole"
                ? 0
                : 1,
            snapshotBlockSequence,
            sourceArea: rectArea(descriptor.sourceRectCss),
            sourceIndex,
          }),
        )
      : preparedFrame.refinementDescriptors.map((descriptor, sourceIndex) => ({
          descriptor,
          priorityRank: 1,
          snapshotBlockSequence: null,
          sourceArea: rectArea(descriptor.sourceRectCss),
          sourceIndex,
        }));
  return orderRetainedPreparationSnapshotDescriptors(candidates);
}

function orderRetainedPreparationSnapshotDescriptors(
  candidates: readonly {
    readonly descriptor: RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number];
    readonly priorityRank: number;
    readonly snapshotBlockSequence: number | null;
    readonly sourceArea: number;
    readonly sourceIndex: number;
  }[],
): readonly {
  readonly descriptor: RetainedContentTexturePagePreparedFrame["refinementDescriptors"][number];
  readonly priorityRank: number;
  readonly snapshotBlockSequence: number | null;
  readonly sourceArea: number;
  readonly sourceIndex: number;
}[] {
  const sorted = [...candidates].sort(
    compareRetainedPreparationSnapshotDescriptors,
  );
  const primaryBySurfaceId = new Set<string>();
  const primary: typeof sorted = [];
  const secondary: typeof sorted = [];
  for (const candidate of sorted) {
    if (!primaryBySurfaceId.has(candidate.descriptor.surfaceId)) {
      primaryBySurfaceId.add(candidate.descriptor.surfaceId);
      primary.push(candidate);
      continue;
    }
    secondary.push(candidate);
  }
  return [...primary, ...secondary];
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

function rectArea(rect: GpuRect): number {
  return rect.width * rect.height;
}

function compareRetainedPreparationSnapshotDescriptors(
  left: {
    readonly priorityRank: number;
    readonly snapshotBlockSequence: number | null;
    readonly sourceArea: number;
    readonly sourceIndex: number;
  },
  right: {
    readonly priorityRank: number;
    readonly snapshotBlockSequence: number | null;
    readonly sourceArea: number;
    readonly sourceIndex: number;
  },
): number {
  return (
    left.priorityRank - right.priorityRank ||
    compareSnapshotBlockSequence(left, right) ||
    right.sourceArea - left.sourceArea ||
    left.sourceIndex - right.sourceIndex
  );
}

function compareSnapshotBlockSequence(
  left: {
    readonly snapshotBlockSequence: number | null;
  },
  right: {
    readonly snapshotBlockSequence: number | null;
  },
): number {
  if (left.snapshotBlockSequence === right.snapshotBlockSequence) {
    return 0;
  }
  if (left.snapshotBlockSequence === null) {
    return 1;
  }
  if (right.snapshotBlockSequence === null) {
    return -1;
  }
  return right.snapshotBlockSequence - left.snapshotBlockSequence;
}
