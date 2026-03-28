import _ from "lodash";
import { useMemo } from "react";
import { useMisc, useProjectState, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  LiveDictArea,
  type LiveDictAreaProps,
} from "./groupContainerLiveDictArea";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSectionInput } from "./groupContainerLiveDictAreaSectionInput";
import { buildLiveDictAreaSectionState } from "./groupContainerLiveDictAreaSectionState";

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
  const liveDictAreaSectionState = useProjectState(
    (state) => buildLiveDictAreaSectionState({ sectionId, state }),
    _.isEqual,
  );
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const liveDictAreaInput = useMemo(
    () =>
      buildLiveDictAreaSectionInput({
        bgColor,
        canEditLayout,
        canEditStructure,
        handleColumnResizeStart,
        isSelectingParams,
        sectionId,
        sectionTypeName,
        unpinnedParamsAreaMinHeight,
        ...liveDictAreaSectionState,
      }),
    [
      bgColor,
      canEditLayout,
      canEditStructure,
      handleColumnResizeStart,
      isSelectingParams,
      sectionId,
      sectionTypeName,
      unpinnedParamsAreaMinHeight,
      liveDictAreaSectionState,
    ],
  );

  return (
    <LiveDictArea
      input={liveDictAreaInput}
      onMaxNestedDepthChange={onMaxNestedDepthChange}
    />
  );
}
