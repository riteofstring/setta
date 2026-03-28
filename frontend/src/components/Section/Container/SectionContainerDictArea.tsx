import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import {
  LiveDictAreaLayout,
  type LiveDictAreaLayoutProps,
} from "../Layouts/LiveDictAreaLayout";
import { SettingsAllSettingsBenchmarkDictArea } from "../Layouts/SettingsAllSettingsBenchmarkDictArea";
import { buildSectionContainerDictAreaView } from "./sectionContainerDictAreaView";

export type SectionContainerDictAreaProps = LiveDictAreaLayoutProps;

function _SectionContainerDictArea({
  bgColor,
  sectionId,
}: SectionContainerDictAreaProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const view = buildSectionContainerDictAreaView({
    benchmarkActive: benchmark.active,
    renderFullSectionBody: benchmark.renderFullSectionBody,
    bgColor,
    sectionId,
  });

  if (view.kind === "benchmark") {
    return (
      <SettingsAllSettingsBenchmarkDictArea {...view.benchmarkDictAreaProps} />
    );
  }

  return <LiveDictAreaLayout {...view.liveDictAreaLayoutProps} />;
}

export const SectionContainerDictArea = React.memo(_SectionContainerDictArea);
