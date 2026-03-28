import { useCallback, useState } from "react";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import type { LiveDictAreaSectionProps } from "./groupContainerLiveDictAreaSection";

export type LiveDictAreaSectionContainerBoundaryInput = Pick<
  LiveDictAreaSectionProps,
  "bgColor" | "sectionId" | "sectionTypeName"
> & {
  outerRef: Parameters<typeof useParamColumnWidth>[0]["outerRef"];
};

export type LiveDictAreaSectionContainerBoundary = Pick<
  LiveDictAreaSectionProps,
  | "bgColor"
  | "handleColumnResizeStart"
  | "onMaxNestedDepthChange"
  | "sectionId"
  | "sectionTypeName"
>;

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
    NonNullable<LiveDictAreaSectionProps["onMaxNestedDepthChange"]>
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

  return {
    bgColor,
    handleColumnResizeStart,
    onMaxNestedDepthChange: handleMaxNestedDepthChange,
    sectionId,
    sectionTypeName,
  };
}
