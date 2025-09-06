import { SectionYamlView } from "components/Params/YamlView";
import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  SectionWithParamsDisplayModeEnum,
} from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SectionSearch } from "../SectionParts/Search";

function _CallableArea({ sectionId, bgColor }) {
  const { callable, hideParams, displayMode } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Callable,
      true,
    );
    const { callable, hideParams, displayMode } = impl;
    return {
      callable,
      hideParams,
      displayMode,
    };
  }, _.isEqual);

  if (displayMode === SectionWithParamsDisplayModeEnum.Yaml) {
    return <SectionYamlView sectionId={sectionId} />;
  }

  return (
    <>
      <SectionSearch sectionId={sectionId} callable={callable} />
      {!hideParams && (
        <>
          <KwargsControls sectionId={sectionId} bgColor={bgColor} />
          <ParamGroupContainer sectionId={sectionId} />
        </>
      )}
    </>
  );
}

export const CallableArea = React.memo(_CallableArea);
