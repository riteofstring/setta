import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import type { AppProps } from "./App";
import { buildBootstrapAppProps } from "./appBootstrap";

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

export function buildRuntimeBootstrapAppProps(): AppProps {
  return buildBootstrapAppProps({
    SectionBoundary: SectionContainerBoundary,
    renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
  });
}
