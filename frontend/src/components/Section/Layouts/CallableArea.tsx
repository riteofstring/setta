import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import type { SectionContentSurface } from "../sectionContentSurface";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _CallableArea({
  sectionId,
  bgColor,
  isMinimized,
  contentSurface = "section",
}: {
  sectionId: string;
  bgColor: string;
  isMinimized: boolean;
  contentSurface?: SectionContentSurface;
}) {
  const { callable, hideParams } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Callable,
      true,
    );
    const { callable, hideParams } = impl;
    return {
      callable,
      hideParams,
    };
  }, _.isEqual);

  return (
    <>
      <SectionSearch
        sectionId={sectionId}
        callable={callable}
        contentSurface={contentSurface}
      />
      {!hideParams && !isMinimized && (
        <>
          <KwargsControls
            sectionId={sectionId}
            contentSurface={contentSurface}
          />
          <ParamGroupContainer
            sectionId={sectionId}
            bgColor={bgColor}
            sectionTypeName={SectionTypeEnum.Callable}
            contentSurface={contentSurface}
          />
        </>
      )}
    </>
  );
}

export const CallableArea = React.memo(_CallableArea);
