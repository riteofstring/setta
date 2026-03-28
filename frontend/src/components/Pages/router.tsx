import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { createElement } from "react";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return createElement(SectionContainerAreaDictBoundary, props);
}

export const router = createModeWrappedBrowserRouter({
  ...buildModeWrappedRouterArgs(),
  renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
});
