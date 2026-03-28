import type { LiveDictAreaLayoutProps } from "../Layouts/LiveDictAreaLayout";
import { resolveDictAreaRenderMode } from "../Layouts/dictAreaView";

type BuildSectionContainerDictAreaViewArgs = LiveDictAreaLayoutProps & {
  benchmarkActive: boolean;
  renderFullSectionBody: boolean;
};

export type SectionContainerDictAreaView =
  | {
      kind: "benchmark";
      benchmarkDictAreaProps: LiveDictAreaLayoutProps;
    }
  | {
      kind: "live";
      liveDictAreaLayoutProps: LiveDictAreaLayoutProps;
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
    liveDictAreaLayoutProps: props,
  };
}
