import type { ZustandProjectState } from "state/definitions";
import type { BaseSectionImplUnion } from "utils/generatedTypes";
import {
  resolveProjectGpuParamAutoContentHeight,
  resolveProjectGpuParamFixedContentHeight,
} from "./projectGpuParamContentLayout";
import {
  getProjectGpuParamContentEdgeStripPortCounts,
  isProjectGpuParamContentSectionImpl,
} from "./projectGpuParamContentSection";
import { countProjectGpuParamRetainedListRows } from "./projectGpuParamContentAdapter";

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
  });
}
