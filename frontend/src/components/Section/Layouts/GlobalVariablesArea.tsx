import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({
  sectionId,
  bgColor,
  renderParamRows = true,
}: {
  sectionId: string;
  bgColor: string;
  renderParamRows?: boolean;
}) {
  return (
    <>
      <KwargsControls sectionId={sectionId} />
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor={bgColor}
        renderParamRows={renderParamRows}
        sectionTypeName={SectionTypeEnum.GlobalVariables}
      />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
