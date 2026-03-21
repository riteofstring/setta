import React from "react";
import type { SectionType } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";
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
            <KwargsControls sectionId={sectionId} />
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
