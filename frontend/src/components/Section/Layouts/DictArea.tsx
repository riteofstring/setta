import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { Tier1DenseParamSectionBody } from "./Tier1DenseParamSectionBody";

function _DictArea({ sectionId, bgColor }) {
  return (
    <Tier1DenseParamSectionBody
      sectionId={sectionId}
      bgColor={bgColor}
      sectionTypeName={SectionTypeEnum.Dict}
    />
  );
}

export const DictArea = React.memo(_DictArea);
