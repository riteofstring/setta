import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SettingsAllSettingsBenchmarkDictArea } from "./SettingsAllSettingsBenchmarkDictArea";

function _DictArea({ sectionId, bgColor }) {
  const benchmark = useSettingsAllSettingsBenchmark();

  if (benchmark.active && !benchmark.renderFullSectionBody) {
    return (
      <SettingsAllSettingsBenchmarkDictArea
        sectionId={sectionId}
        bgColor={bgColor}
      />
    );
  }

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
