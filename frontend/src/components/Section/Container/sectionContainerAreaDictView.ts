import type { DictAreaProps } from "../Layouts/DictArea";
import { resolveDictAreaRenderMode } from "../Layouts/dictAreaView";

type BuildSectionContainerAreaDictViewArgs = DictAreaProps & {
  benchmarkActive: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerAreaDictView =
  | {
      kind: "benchmark";
      benchmarkDictAreaProps: DictAreaProps;
    }
  | {
      kind: "live";
      liveSectionContainerDictAreaProps: DictAreaProps;
    };

export function buildSectionContainerAreaDictView({
  benchmarkActive,
  renderFullSectionBody,
  bgColor,
  sectionId,
}: BuildSectionContainerAreaDictViewArgs): SectionContainerAreaDictView {
  const props = { bgColor, sectionId };

  if (
    resolveDictAreaRenderMode({
      benchmarkActive,
      renderFullSectionBody,
    }) === "benchmark"
  ) {
    return {
      kind: "benchmark",
      benchmarkDictAreaProps: props,
    };
  }

  return {
    kind: "live",
    liveSectionContainerDictAreaProps: props,
  };
}
