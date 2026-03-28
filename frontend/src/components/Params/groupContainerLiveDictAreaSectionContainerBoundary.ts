import { useEffect, useMemo, useState } from "react";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import {
  buildLiveDictAreaMountBoundary,
  type LiveDictAreaMountBoundary,
} from "./groupContainerLiveDictAreaMountBoundary";
import { useLiveDictAreaSectionStoreBoundary } from "./groupContainerLiveDictAreaSectionStoreBoundary";

export type LiveDictAreaSectionContainerBoundaryInput = Pick<
  Parameters<typeof useLiveDictAreaSectionStoreBoundary>[0],
  "bgColor" | "sectionId" | "sectionTypeName"
> & {
  outerRef: Parameters<typeof useParamColumnWidth>[0]["outerRef"];
};

export type LiveDictAreaSectionContainerBoundary = LiveDictAreaMountBoundary;

export function useLiveDictAreaSectionContainerBoundary({
  bgColor,
  outerRef,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionContainerBoundaryInput): LiveDictAreaSectionContainerBoundary {
  const [maxNestedDepth, onMaxNestedDepthChange] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });
  const liveDictAreaInput = useLiveDictAreaSectionStoreBoundary({
    bgColor,
    handleColumnResizeStart,
    sectionId,
    sectionTypeName,
  });
  const liveDictAreaMountBoundary = useMemo(
    () => buildLiveDictAreaMountBoundary({ input: liveDictAreaInput }),
    [liveDictAreaInput],
  );
  const nextPinnedMaxNestedDepth =
    liveDictAreaMountBoundary.maxNestedDepth.pinned;
  const nextUnpinnedMaxNestedDepth =
    liveDictAreaMountBoundary.maxNestedDepth.unpinned;

  useEffect(() => {
    if (
      maxNestedDepth.pinned === nextPinnedMaxNestedDepth &&
      maxNestedDepth.unpinned === nextUnpinnedMaxNestedDepth
    ) {
      return;
    }

    onMaxNestedDepthChange({
      pinned: nextPinnedMaxNestedDepth,
      unpinned: nextUnpinnedMaxNestedDepth,
    });
  }, [
    maxNestedDepth.pinned,
    maxNestedDepth.unpinned,
    nextPinnedMaxNestedDepth,
    nextUnpinnedMaxNestedDepth,
  ]);

  return liveDictAreaMountBoundary;
}
