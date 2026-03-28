import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import type { ModeRouteElements } from "./modeRouteResolver";
import { ModeWrappedRouteBoundary } from "./ModeWrappedRouteBoundary";
import type { ModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export type ModeWrappedRouteBoundaryArgs = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "renderModeElement" | "viewModeRouteElements"
>;

export function buildModeWrappedRouteBoundaryArgs({
  projectRouteElements,
}: Pick<
  ModeWrappedRouterRouteElements,
  "projectRouteElements"
>): ModeWrappedRouteBoundaryArgs {
  return {
    renderModeElement: (routeElements: ModeRouteElements) => (
      <ModeWrappedRouteBoundary {...routeElements} />
    ),
    viewModeRouteElements: projectRouteElements,
  };
}
