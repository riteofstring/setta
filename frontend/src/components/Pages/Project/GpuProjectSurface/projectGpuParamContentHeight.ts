import type { ZustandProjectState } from "state/definitions";
import type { BaseSectionImplUnion } from "utils/generatedTypes";
import {
  resolveProjectGpuParamAutoContentHeight,
  resolveProjectGpuParamContentVerticalChromeHeight,
  resolveProjectGpuParamFixedContentHeight,
} from "./projectGpuParamContentLayout";
import { getProjectGpuParamRetainedListRowStats } from "./projectGpuParamContentRowStats";
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
  const pinnedStats = getProjectGpuParamRetainedListRowStats({
    key: "pinned",
    projectState,
    sectionId,
    sectionImpl,
  });
  return resolveProjectGpuParamFixedContentHeight({
    ...edgeStripPortCounts,
    pinnedContentHeight: pinnedStats.contentHeight,
    pinnedRowCount: pinnedStats.rowCount,
    pinnedRowVerticalGapHeight: pinnedStats.verticalGapHeight,
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
  return resolveProjectGpuParamAutoContentHeight({
    ...edgeStripPortCounts,
    pinnedContentHeight: pinnedStats.contentHeight,
    pinnedRowCount: pinnedStats.rowCount,
    reserveEmptyContentHeight:
      !sectionImpl.isMinimized &&
      !("hideParams" in sectionImpl && Boolean(sectionImpl.hideParams)),
    unpinnedContentHeight: unpinnedStats?.contentHeight ?? 0,
    unpinnedRowCount: unpinnedStats?.rowCount ?? 0,
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
