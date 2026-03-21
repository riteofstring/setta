import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _DictArea({ sectionId, bgColor }) {
  return (
    <>
      <KwargsControls sectionId={sectionId} />
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor={bgColor}
        sectionTypeName={SectionTypeEnum.Dict}
      />
    </>
  );
}

export const DictArea = React.memo(_DictArea);
