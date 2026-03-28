import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { createElement } from "react";
import { createBrowserRouter } from "react-router-dom";
import {
  buildModeWrappedAppRouteStack,
  type BuildModeWrappedAppRouteStackArgs,
} from "./modeWrappedAppRouteStack";

export type CreateModeWrappedBrowserRouterArgs = Omit<
  BuildModeWrappedAppRouteStackArgs,
  "renderDictArea"
>;

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return createElement(SectionContainerAreaDictBoundary, props);
}

export function createModeWrappedBrowserRouter(
  args: CreateModeWrappedBrowserRouterArgs,
) {
  return createBrowserRouter(
    buildModeWrappedAppRouteStack({
      ...args,
      renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
    }),
  );
}
