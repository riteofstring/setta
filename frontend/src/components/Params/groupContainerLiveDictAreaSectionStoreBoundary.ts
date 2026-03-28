import _ from "lodash";
import { useMisc, useProjectState, useSettings } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSectionBoundary } from "./groupContainerLiveDictAreaSectionBoundary";

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

  return useProjectState(
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
}
