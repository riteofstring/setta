import type { DictAreaLiveBoundaryProps } from "../Layouts/DictAreaLiveBoundary";
import { resolveDictAreaRenderMode } from "../Layouts/dictAreaView";

type BuildSectionContainerAreaDictViewArgs = DictAreaLiveBoundaryProps & {
  benchmarkActive: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerAreaDictView =
  | {
      kind: "benchmark";
      benchmarkDictAreaProps: DictAreaLiveBoundaryProps;
    }
  | {
      kind: "live";
      liveSectionContainerDictAreaProps: DictAreaLiveBoundaryProps;
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
