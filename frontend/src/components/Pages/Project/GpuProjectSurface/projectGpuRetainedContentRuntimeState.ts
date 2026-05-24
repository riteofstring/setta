import {
  createGpuRetainedContentRuntimeState,
  getGpuRetainedContentRuntimeScrollOffsets,
  replaceGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "gpuFlow/retainedContentRuntimeState";
import type { GpuRetainedContentScrollOffsetMap } from "gpuFlow/retainedContentScroll";
import { useCallback, useMemo, useState } from "react";

export type ProjectGpuRetainedContentScrollSetter = (
  offsets: GpuRetainedContentScrollOffsetMap,
) => void;

export type ProjectGpuRetainedContentRuntimeAdapter = {
  readonly contentScrollCommandRevision: number;
  readonly getContentScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly setContentScrollOffsets: ProjectGpuRetainedContentScrollSetter;
};

export function useProjectGpuRetainedContentRuntimeAdapter(): ProjectGpuRetainedContentRuntimeAdapter {
  const [contentScrollCommandRevision, setContentScrollCommandRevision] =
    useState(0);
  const [retainedContentRuntimeState] = useState(() =>
    createGpuRetainedContentRuntimeState(),
  );
  const setContentScrollOffsets = useCallback(
    (scrollOffsets: GpuRetainedContentScrollOffsetMap) => {
      const changed = replaceGpuRetainedContentRuntimeScrollOffsets({
        scrollOffsets,
        state: retainedContentRuntimeState,
      });
      if (changed) {
        setContentScrollCommandRevision((revision) => revision + 1);
      }
    },
    [retainedContentRuntimeState],
  );
  const getContentScrollOffsets = useCallback(
    () =>
      getGpuRetainedContentRuntimeScrollOffsets(retainedContentRuntimeState),
    [retainedContentRuntimeState],
  );

  return useMemo(
    () => ({
      contentScrollCommandRevision,
      getContentScrollOffsets,
      retainedContentRuntimeState,
      setContentScrollOffsets,
    }),
    [
      contentScrollCommandRevision,
      getContentScrollOffsets,
      retainedContentRuntimeState,
      setContentScrollOffsets,
    ],
  );
}
