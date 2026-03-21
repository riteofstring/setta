import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { Tier1DenseParamSectionBody } from "./Tier1DenseParamSectionBody";

function _CallableArea({
  sectionId,
  bgColor,
  isMinimized,
}: {
  sectionId: string;
  bgColor: string;
  isMinimized: boolean;
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
    <Tier1DenseParamSectionBody
      sectionId={sectionId}
      bgColor={bgColor}
      sectionTypeName={SectionTypeEnum.Callable}
      callable={callable}
      hideParams={hideParams}
      isMinimized={isMinimized}
    />
  );
}

export const CallableArea = React.memo(_CallableArea);
