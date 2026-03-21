import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import { useIsSectionUIActive } from "state/activeSectionUI";
import type { SectionType } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shouldTrimSectionSecondaryChromeOnInteraction } from "../Container/sectionBodyModePolicy";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { SectionSearch } from "../SectionParts/Search";
import { KwargsControls } from "../SectionParts/KwargsControls";

type Tier1DenseParamSectionType = Extract<
  SectionType,
  "Callable" | "Dict" | "GlobalVariables"
>;

type Tier1DenseParamSectionBodyProps = {
  sectionId: string;
  bgColor: string;
  sectionTypeName: Tier1DenseParamSectionType;
  callable?: string | null;
  hideParams?: boolean;
  isMinimized?: boolean;
};

export const Tier1DenseParamSectionBody = React.memo(
  function Tier1DenseParamSectionBody({
    sectionId,
    bgColor,
    sectionTypeName,
    callable = null,
    hideParams = false,
    isMinimized = false,
  }: Tier1DenseParamSectionBodyProps) {
    const isActiveSection = useIsSectionUIActive(sectionId);
    const viewportInteractionActive = useReactFlow(
      (state) => state.viewportInteractionActive,
    );
    const trimSecondaryChrome = shouldTrimSectionSecondaryChromeOnInteraction({
      ownerKind: "canvas",
      family: "tier1-dense-params",
      isActiveSection,
      viewportInteractionActive,
    });
    const shouldRenderSearch =
      sectionTypeName === SectionTypeEnum.Callable && callable !== null;
    const shouldRenderParamStack = !hideParams && !isMinimized;

    return (
      <>
        {shouldRenderSearch ? (
          <SectionSearch sectionId={sectionId} callable={callable} />
        ) : null}
        {shouldRenderParamStack ? (
          <>
            <KwargsControls
              sectionId={sectionId}
              showActionButtons={!trimSecondaryChrome}
            />
            <ParamGroupContainer
              sectionId={sectionId}
              bgColor={bgColor}
              sectionTypeName={sectionTypeName}
            />
          </>
        ) : null}
      </>
    );
  },
);
