import { useState } from "react";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import { SectionTypeEnum } from "utils/generatedTypes";
import { LiveDictAreaSection } from "./groupContainerLiveDictAreaSection";

type LiveDictAreaSectionContainerProps = {
  bgColor: string;
  outerRef: Parameters<typeof useParamColumnWidth>[0]["outerRef"];
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
};

export function LiveDictAreaSectionContainer({
  bgColor,
  outerRef,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionContainerProps) {
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  return (
    <LiveDictAreaSection
      bgColor={bgColor}
      handleColumnResizeStart={handleColumnResizeStart}
      onMaxNestedDepthChange={setMaxNestedDepth}
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
    />
  );
}
