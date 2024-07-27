import React from "react";
import { ParamGroupContainer } from "../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _GlobalVariablesArea({ sectionId }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} objInfoId={null} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={null} />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
