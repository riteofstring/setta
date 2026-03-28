import { createBrowserRouter } from "react-router-dom";
import {
  buildModeWrappedAppRouteStack,
  type BuildModeWrappedAppRouteStackArgs,
} from "./modeWrappedAppRouteStack";

export function createModeWrappedBrowserRouter(
  args: BuildModeWrappedAppRouteStackArgs,
) {
  return createBrowserRouter(buildModeWrappedAppRouteStack(args));
}
