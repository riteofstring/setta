import { ModeWrappedRouteBoundary } from "./ModeWrappedRouteBoundary";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export function buildModeWrappedRouterArgs(): BuildModeWrappedAppRouteStackArgs {
  const routeElements = buildModeWrappedRouterRouteElements();

  return {
    renderModeElement: (routeElements) => (
      <ModeWrappedRouteBoundary {...routeElements} />
    ),
    ...routeElements,
    viewModeRouteElements: routeElements.projectRouteElements,
  };
}
