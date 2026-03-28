import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";
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

  return <LiveDictAreaLayout sectionId={sectionId} bgColor={bgColor} />;
}

export const DictArea = React.memo(_DictArea);
