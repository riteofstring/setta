import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({ sectionId, bgColor }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} />
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor={bgColor}
        sectionTypeName={SectionTypeEnum.GlobalVariables}
      />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
