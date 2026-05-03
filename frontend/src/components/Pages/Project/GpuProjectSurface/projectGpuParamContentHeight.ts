import type { ZustandProjectState } from "state/definitions";
import type { BaseSectionImplUnion } from "utils/generatedTypes";
import {
  resolveProjectGpuParamAutoContentHeight,
  resolveProjectGpuParamContentVerticalChromeHeight,
  resolveProjectGpuParamFixedContentHeight,
} from "./projectGpuParamContentLayout";
import {
  countProjectGpuParamRetainedListRows,
  getProjectGpuParamRetainedListRowStats,
} from "./projectGpuParamContentRowStats";
import {
  getProjectGpuParamContentEdgeStripPortCounts,
  isProjectGpuParamContentSectionImpl,
} from "./projectGpuParamContentSection";

export function getProjectGpuParamFixedContentHeightForSection({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number {
  if (!isProjectGpuParamContentSectionImpl(sectionImpl)) {
    return 0;
  }
  const edgeStripPortCounts =
    getProjectGpuParamContentEdgeStripPortCounts(sectionImpl);
  return resolveProjectGpuParamFixedContentHeight({
    ...edgeStripPortCounts,
    pinnedRowCount: countProjectGpuParamRetainedListRows({
      key: "pinned",
      projectState,
      sectionId,
      sectionImpl,
    }),
  });
}

export function getProjectGpuParamAutoContentHeightForSection({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number | null {
  if (!isProjectGpuParamContentSectionImpl(sectionImpl)) {
    return null;
  }
  const edgeStripPortCounts =
    getProjectGpuParamContentEdgeStripPortCounts(sectionImpl);
  return resolveProjectGpuParamAutoContentHeight({
    ...edgeStripPortCounts,
    pinnedRowCount: countProjectGpuParamRetainedListRows({
      key: "pinned",
      projectState,
      sectionId,
      sectionImpl,
    }),
    unpinnedRowCount: sectionImpl.hideUnpinnedParams
      ? 0
      : countProjectGpuParamRetainedListRows({
          key: "unpinned",
          projectState,
          sectionId,
          sectionImpl,
        }),
    reserveEmptyContentHeight:
      !sectionImpl.isMinimized &&
      !("hideParams" in sectionImpl && Boolean(sectionImpl.hideParams)),
  });
}

export function getProjectGpuParamContentVerticalChromeHeightForSection({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: BaseSectionImplUnion;
}): number | null {
  if (!isProjectGpuParamContentSectionImpl(sectionImpl)) {
    return null;
  }
  const pinnedStats = getProjectGpuParamRetainedListRowStats({
    key: "pinned",
    projectState,
    sectionId,
    sectionImpl,
  });
  const unpinnedStats = sectionImpl.hideUnpinnedParams
    ? null
    : getProjectGpuParamRetainedListRowStats({
        key: "unpinned",
        projectState,
        sectionId,
        sectionImpl,
      });
  return resolveProjectGpuParamContentVerticalChromeHeight({
    hasNestedBlockBottomChrome:
      pinnedStats.hasNestedBlockBottomChrome ||
      Boolean(unpinnedStats?.hasNestedBlockBottomChrome) ||
      (pinnedStats.endsWithNestedRow &&
        Boolean(unpinnedStats && unpinnedStats.rowCount > 0)),
  });
}
