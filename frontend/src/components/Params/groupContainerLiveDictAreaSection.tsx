import _ from "lodash";
import { useMisc, useProjectState, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  LiveDictArea,
  type LiveDictAreaProps,
} from "./groupContainerLiveDictArea";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSectionBoundary } from "./groupContainerLiveDictAreaSectionBoundary";

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
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const liveDictAreaInput = useProjectState(
    (state) =>
      buildLiveDictAreaSectionBoundary({
        bgColor,
        canEditLayout,
        canEditStructure,
        handleColumnResizeStart,
        isSelectingParams,
        sectionId,
        sectionTypeName,
        state,
        unpinnedParamsAreaMinHeight,
      }),
    _.isEqual,
  );

  return (
    <LiveDictArea
      input={liveDictAreaInput}
      onMaxNestedDepthChange={onMaxNestedDepthChange}
    />
  );
}
