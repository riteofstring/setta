import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { Tier1DenseParamSectionBody } from "./Tier1DenseParamSectionBody";

function _GlobalVariablesArea({ sectionId, bgColor }) {
  return (
    <Tier1DenseParamSectionBody
      sectionId={sectionId}
      bgColor={bgColor}
      sectionTypeName={SectionTypeEnum.GlobalVariables}
    />
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
