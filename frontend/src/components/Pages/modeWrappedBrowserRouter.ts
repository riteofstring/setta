import { createBrowserRouter } from "react-router-dom";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedAppRouteStack } from "./modeWrappedAppRouteStack";

export function createModeWrappedBrowserRouter(
  routeStackArgs: BuildModeWrappedAppRouteStackArgs,
) {
  return createBrowserRouter(buildModeWrappedAppRouteStack(routeStackArgs));
}
