import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { SettingsAllSettingsBenchmarkDictArea } from "../Layouts/SettingsAllSettingsBenchmarkDictArea";
import {
  SectionContainerDictArea,
  type SectionContainerDictAreaProps,
} from "./SectionContainerDictArea";
import { buildSectionContainerAreaDictView } from "./sectionContainerAreaDictView";

function _SectionContainerAreaDictBoundary(props: SectionContainerDictAreaProps) {
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

  return (
    <SectionContainerDictArea {...view.liveSectionContainerDictAreaProps} />
  );
}

export const SectionContainerAreaDictBoundary = React.memo(
  _SectionContainerAreaDictBoundary,
);
