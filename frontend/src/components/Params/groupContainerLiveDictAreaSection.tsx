import { SectionTypeEnum } from "utils/generatedTypes";
import {
  LiveDictArea,
  type LiveDictAreaProps,
} from "./groupContainerLiveDictArea";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { useLiveDictAreaSectionStoreBoundary } from "./groupContainerLiveDictAreaSectionStoreBoundary";

export type LiveDictAreaSectionProps = {
  bgColor: string;
  handleColumnResizeStart: LiveDictAreaRenderBoundaryInput["handleColumnResizeStart"];
  onMaxNestedDepthChange?: LiveDictAreaProps["onMaxNestedDepthChange"];
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

  return (
    <LiveDictArea
      input={liveDictAreaInput}
      onMaxNestedDepthChange={onMaxNestedDepthChange}
    />
  );
}
