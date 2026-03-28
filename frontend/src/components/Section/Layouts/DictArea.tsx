import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { SettingsAllSettingsBenchmarkDictArea } from "./SettingsAllSettingsBenchmarkDictArea";
import { resolveDictAreaRenderMode } from "./dictAreaView";

type DictAreaProps = {
  sectionId: string;
  bgColor: string;
};

function _DictArea({ sectionId, bgColor }: DictAreaProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const renderMode = resolveDictAreaRenderMode({
    benchmarkActive: benchmark.active,
    renderFullSectionBody: benchmark.renderFullSectionBody,
  });

  if (renderMode === "benchmark") {
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
