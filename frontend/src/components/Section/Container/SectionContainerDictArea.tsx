import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import {
  DictAreaLiveBoundary,
  type DictAreaLiveBoundaryProps,
} from "../Layouts/DictAreaLiveBoundary";
import { SettingsAllSettingsBenchmarkDictArea } from "../Layouts/SettingsAllSettingsBenchmarkDictArea";
import { buildSectionContainerDictAreaView } from "./sectionContainerDictAreaView";

export type SectionContainerDictAreaProps = DictAreaLiveBoundaryProps;

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

  return <DictAreaLiveBoundary {...view.liveDictAreaBoundaryProps} />;
}

export const SectionContainerDictArea = React.memo(_SectionContainerDictArea);
