import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _DictArea({
  sectionId,
  bgColor,
  renderParamRows = true,
  trackMeasuredHeight = true,
}: {
  sectionId: string;
  bgColor: string;
  renderParamRows?: boolean;
  trackMeasuredHeight?: boolean;
}) {
  return (
    <>
      <KwargsControls
        sectionId={sectionId}
        trackMeasuredHeight={trackMeasuredHeight}
      />
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor={bgColor}
        renderParamRows={renderParamRows}
        sectionTypeName={SectionTypeEnum.Dict}
      />
    </>
  );
}

export const DictArea = React.memo(_DictArea);
