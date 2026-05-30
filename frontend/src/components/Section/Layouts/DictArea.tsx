import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import type { SectionContentSurface } from "../sectionContentSurface";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _DictArea({
  sectionId,
  bgColor,
  contentSurface = "section",
}: {
  sectionId: string;
  bgColor: string;
  contentSurface?: SectionContentSurface;
}) {
  return (
    <>
      <KwargsControls sectionId={sectionId} contentSurface={contentSurface} />
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor={bgColor}
        sectionTypeName={SectionTypeEnum.Dict}
        contentSurface={contentSurface}
      />
    </>
  );
}

export const DictArea = React.memo(_DictArea);
