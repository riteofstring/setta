import { SectionYamlView } from "components/Params/YamlView";
import React from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  SectionWithParamsDisplayModeEnum,
} from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function _DictArea({ sectionId, bgColor }) {
  const displayMode = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Dict,
      true,
    );
    return impl.displayMode;
  });

  if (displayMode === SectionWithParamsDisplayModeEnum.Yaml) {
    return <SectionYamlView sectionId={sectionId} />;
  }
  return (
    <>
      <KwargsControls sectionId={sectionId} bgColor={bgColor} />
      <ParamGroupContainer sectionId={sectionId} />
    </>
  );
}

export const DictArea = React.memo(_DictArea);
