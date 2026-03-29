import {
  useSettingsAllSettingsBenchmark,
  type SettingsAllSettingsBenchmarkStage,
} from "components/Pages/Project/settingsAllSettingsBenchmark";
import React from "react";
import { SectionCanvasBody } from "./SectionCanvasBody";
import {
  buildSectionContainerCoreBodyView,
  type SectionContainerCoreBodyProps,
} from "./sectionContainerCoreBodyView";

function _SectionContainerCoreCanvasBody(props: SectionContainerCoreBodyProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const view = buildSectionContainerCoreBodyView({
    ...props,
    benchmarkActive: benchmark.active,
    benchmarkStage: benchmark.stage,
    renderSectionBody: benchmark.renderSectionBody,
    renderFullSectionBody: benchmark.renderFullSectionBody,
  });

  switch (view.kind) {
    case "canvas":
      return <SectionCanvasBody {...view.props} />;
    case "benchmark-placeholder":
      return <BenchmarkSectionBodyPlaceholder stage={view.stage} />;
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionContainerCoreCanvasBody = React.memo(
  _SectionContainerCoreCanvasBody,
);

function BenchmarkSectionBodyPlaceholder({
  stage,
}: {
  stage: SettingsAllSettingsBenchmarkStage;
}) {
  return (
    <div
      className="section-row-pin-main flex min-h-12 w-full items-center justify-center px-3 py-3 text-[0.6rem] uppercase tracking-[0.18em] text-setta-300 dark:text-setta-600"
      data-settings-benchmark-placeholder={stage}
    >
      {stage === "frame-only" ? "Frame only" : "Header only"}
    </div>
  );
}
