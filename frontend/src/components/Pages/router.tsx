import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

export type CreateAppRouterArgs = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "renderDictArea"
>;

export function createAppRouter({ renderDictArea }: CreateAppRouterArgs) {
  return createModeWrappedBrowserRouter({
    ...buildModeWrappedRouterArgs({
      SectionBoundary: SectionContainerBoundary,
    }),
    renderDictArea,
  });
}
