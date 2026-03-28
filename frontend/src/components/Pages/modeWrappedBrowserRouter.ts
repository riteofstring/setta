import { createBrowserRouter } from "react-router-dom";
import {
  buildModeWrappedAppRouteStack,
  type BuildModeWrappedAppRouteStackArgs,
} from "./modeWrappedAppRouteStack";

export type CreateModeWrappedBrowserRouterArgs = BuildModeWrappedAppRouteStackArgs;

export function createModeWrappedBrowserRouter(
  args: CreateModeWrappedBrowserRouterArgs,
) {
  return createBrowserRouter(buildModeWrappedAppRouteStack(args));
}
