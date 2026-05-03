import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _CallableArea({
  sectionId,
  bgColor,
  isMinimized,
  renderParamRows = true,
  syncDomPortGeometry = true,
}: {
  sectionId: string;
  bgColor: string;
  isMinimized: boolean;
  renderParamRows?: boolean;
  syncDomPortGeometry?: boolean;
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
        syncDomPortGeometry={syncDomPortGeometry}
      />
      {!hideParams && !isMinimized && (
        <>
          <KwargsControls sectionId={sectionId} />
          <ParamGroupContainer
            sectionId={sectionId}
            bgColor={bgColor}
            renderParamRows={renderParamRows}
            sectionTypeName={SectionTypeEnum.Callable}
          />
        </>
      )}
    </>
  );
}

export const CallableArea = React.memo(_CallableArea);
