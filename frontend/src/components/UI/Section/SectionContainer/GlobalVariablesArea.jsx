import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import React from "react";
import { ParamGroupContainer } from "./Main/Group/GroupContainer";
import { KwargsControls } from "./Main/KwargsControls/KwargsControls";

function _GlobalVariablesArea({ sectionId }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} objInfoId={NULL_OBJ_ID} />
      <ParamGroupContainer sectionId={sectionId} objInfoId={NULL_OBJ_ID} />
    </>
  );
}

export const GlobalVariablesArea = React.memo(_GlobalVariablesArea);
