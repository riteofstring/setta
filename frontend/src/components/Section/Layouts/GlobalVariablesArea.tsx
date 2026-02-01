import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({ sectionId, bgColor }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} bgColor={bgColor} />
      <ParamGroupContainer sectionId={sectionId} />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
