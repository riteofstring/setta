import { useCallback, useEffect, useMemo, useState } from "react";
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
  const handleMaxNestedDepthChange = useCallback<
    (nextMaxNestedDepth: LiveDictAreaMountBoundary["maxNestedDepth"]) => void
  >((nextMaxNestedDepth) => {
    onMaxNestedDepthChange((currentMaxNestedDepth) => {
      if (
        currentMaxNestedDepth.pinned === nextMaxNestedDepth.pinned &&
        currentMaxNestedDepth.unpinned === nextMaxNestedDepth.unpinned
      ) {
        return currentMaxNestedDepth;
      }

      return nextMaxNestedDepth;
    });
  }, []);
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

  useEffect(() => {
    handleMaxNestedDepthChange(liveDictAreaMountBoundary.maxNestedDepth);
  }, [handleMaxNestedDepthChange, liveDictAreaMountBoundary.maxNestedDepth]);

  return liveDictAreaMountBoundary;
}
