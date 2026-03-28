import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export function buildModeWrappedRouterArgs(): BuildModeWrappedAppRouteStackArgs {
  const routeElements = buildModeWrappedRouterRouteElements();
  const routeBoundaryArgs = buildModeWrappedRouteBoundaryArgs({
    projectRouteElements: routeElements.projectRouteElements,
  });

  return {
    ...routeElements,
    ...routeBoundaryArgs,
  };
}
