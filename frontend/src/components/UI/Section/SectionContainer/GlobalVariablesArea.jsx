import React from "react";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";

function _GlobalVariablesArea({ sectionId }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} objInfoId={null} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={null} />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
