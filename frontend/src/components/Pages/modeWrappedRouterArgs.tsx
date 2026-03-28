import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { CreateModeWrappedBrowserRouterArgs } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export function buildModeWrappedRouterArgs(): CreateModeWrappedBrowserRouterArgs {
  const routeElements = buildModeWrappedRouterRouteElements({
    SectionBoundary: SectionContainerBoundary,
  });
  const routeBoundaryArgs = buildModeWrappedRouteBoundaryArgs({
    projectRouteElements: routeElements.projectRouteElements,
  });

  return {
    ...routeElements,
    ...routeBoundaryArgs,
  };
}
