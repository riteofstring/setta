import { useEffect, useMemo } from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import {
  buildLiveDictAreaMountBoundary,
  type LiveDictAreaMountBoundary,
} from "./groupContainerLiveDictAreaMountBoundary";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { useLiveDictAreaSectionStoreBoundary } from "./groupContainerLiveDictAreaSectionStoreBoundary";

export type LiveDictAreaSectionProps = {
  bgColor: string;
  handleColumnResizeStart: LiveDictAreaRenderBoundaryInput["handleColumnResizeStart"];
  onMaxNestedDepthChange?: (
    maxNestedDepth: LiveDictAreaMountBoundary["maxNestedDepth"],
  ) => void;
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
};

export function LiveDictAreaSection({
  bgColor,
  handleColumnResizeStart,
  onMaxNestedDepthChange,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionProps) {
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
    onMaxNestedDepthChange?.(liveDictAreaMountBoundary.maxNestedDepth);
  }, [liveDictAreaMountBoundary.maxNestedDepth, onMaxNestedDepthChange]);

  return (
    <LiveDictAreaMount {...liveDictAreaMountBoundary.liveDictAreaMountProps} />
  );
}
