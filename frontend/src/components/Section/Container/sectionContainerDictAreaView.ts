import type { DictAreaLiveBoundaryProps } from "../Layouts/DictAreaLiveBoundary";
import { resolveDictAreaRenderMode } from "../Layouts/dictAreaView";

type BuildSectionContainerDictAreaViewArgs = DictAreaLiveBoundaryProps & {
  benchmarkActive: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerDictAreaView =
  | {
      kind: "benchmark";
      benchmarkDictAreaProps: DictAreaLiveBoundaryProps;
    }
  | {
      kind: "live";
      liveDictAreaBoundaryProps: DictAreaLiveBoundaryProps;
    };

export function buildSectionContainerDictAreaView({
  benchmarkActive,
  renderFullSectionBody,
  bgColor,
  sectionId,
}: BuildSectionContainerDictAreaViewArgs): SectionContainerDictAreaView {
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
    liveDictAreaBoundaryProps: props,
  };
}
