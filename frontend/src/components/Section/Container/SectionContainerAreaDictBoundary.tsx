import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { DictArea, type DictAreaProps } from "../Layouts/DictArea";
import { SettingsAllSettingsBenchmarkDictArea } from "../Layouts/SettingsAllSettingsBenchmarkDictArea";
import { buildSectionContainerAreaDictView } from "./sectionContainerAreaDictView";

function _SectionContainerAreaDictBoundary(props: DictAreaProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const view = buildSectionContainerAreaDictView({
    benchmarkActive: benchmark.active,
    renderFullSectionBody: benchmark.renderFullSectionBody,
    ...props,
  });

  if (view.kind === "benchmark") {
    return (
      <SettingsAllSettingsBenchmarkDictArea {...view.benchmarkDictAreaProps} />
    );
  }

  return <DictArea {...view.liveDictAreaProps} />;
}

export const SectionContainerAreaDictBoundary = React.memo(
  _SectionContainerAreaDictBoundary,
);
