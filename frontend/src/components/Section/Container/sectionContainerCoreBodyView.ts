import type { SettingsAllSettingsBenchmarkStage } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { SectionTypeEnum } from "utils/generatedTypes";
import type { SectionCanvasBodyProps } from "./sectionCanvasBodyView";

export type SectionContainerCoreBodyProps = SectionCanvasBodyProps;

type SectionContainerCoreBodyViewInput = SectionContainerCoreBodyProps & {
  benchmarkActive: boolean;
  benchmarkStage: SettingsAllSettingsBenchmarkStage;
  renderSectionBody: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerCoreBodyView =
  | { kind: "canvas"; props: SectionCanvasBodyProps }
  | { kind: "benchmark-placeholder"; stage: SettingsAllSettingsBenchmarkStage }
  | { kind: "none" };

export function buildSectionContainerCoreBodyView({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
  benchmarkActive,
  benchmarkStage,
  renderSectionBody,
  renderFullSectionBody,
}: SectionContainerCoreBodyViewInput): SectionContainerCoreBodyView {
  if (!benchmarkActive || renderFullSectionBody || renderSectionBody) {
    return {
      kind: "canvas",
      props: {
        sectionId,
        sectionTypeName,
        bgColor,
        isMinimized,
        isUserView,
      },
    };
  }

  if (sectionTypeName === SectionTypeEnum.MetaControl) {
    return { kind: "none" };
  }

  return {
    kind: "benchmark-placeholder",
    stage: benchmarkStage,
  };
}
