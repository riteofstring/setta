import type { CreateModeWrappedBrowserRouterArgs } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export function buildModeWrappedRouterArgs(): CreateModeWrappedBrowserRouterArgs {
  const routeElements = buildModeWrappedRouterRouteElements();
  const routeBoundaryArgs = buildModeWrappedRouteBoundaryArgs({
    projectRouteElements: routeElements.projectRouteElements,
  });

  return {
    ...routeElements,
    ...routeBoundaryArgs,
  };
}
