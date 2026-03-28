import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import { createBrowserRouter } from "react-router-dom";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedAppRouteStack } from "./modeWrappedAppRouteStack";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

export type CreateModeWrappedBrowserRouterArgs = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "renderDictArea"
>;

export function createModeWrappedBrowserRouter({
  renderDictArea,
}: CreateModeWrappedBrowserRouterArgs) {
  return createBrowserRouter(
    buildModeWrappedAppRouteStack({
      ...buildModeWrappedRouterArgs({
        SectionBoundary: SectionContainerBoundary,
      }),
      renderDictArea,
    }),
  );
}
