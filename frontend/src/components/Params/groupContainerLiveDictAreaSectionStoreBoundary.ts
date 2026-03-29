import _ from "lodash";
import { useMemo } from "react";
import { useMisc, useProjectState, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSectionBoundaryFromState } from "./groupContainerLiveDictAreaSectionBoundary";
import { buildLiveDictAreaSectionState } from "./groupContainerLiveDictAreaSectionState";

export type LiveDictAreaSectionStoreBoundaryInput = {
  bgColor: string;
  handleColumnResizeStart: LiveDictAreaRenderBoundaryInput["handleColumnResizeStart"];
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
};

export function useLiveDictAreaSectionStoreBoundary({
  bgColor,
  handleColumnResizeStart,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionStoreBoundaryInput): LiveDictAreaRenderBoundaryInput {
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const sectionState = useProjectState(
    (state) => buildLiveDictAreaSectionState({ sectionId, state }),
    _.isEqual,
  );

  return useMemo(
    () =>
      buildLiveDictAreaSectionBoundaryFromState({
        bgColor,
        canEditLayout,
        canEditStructure,
        handleColumnResizeStart,
        isSelectingParams,
        sectionId,
        sectionState,
        sectionTypeName,
        unpinnedParamsAreaMinHeight,
      }),
    [
      bgColor,
      canEditLayout,
      canEditStructure,
      handleColumnResizeStart,
      isSelectingParams,
      sectionId,
      sectionState,
      sectionTypeName,
      unpinnedParamsAreaMinHeight,
    ],
  );
}
