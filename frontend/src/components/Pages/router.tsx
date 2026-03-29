import type { ComponentType } from "react";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

export type CreateAppRouterArgs = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "renderDictArea"
> & {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function createAppRouter({
  SectionBoundary,
  renderDictArea,
}: CreateAppRouterArgs) {
  return createModeWrappedBrowserRouter({
    ...buildModeWrappedRouterArgs({
      SectionBoundary,
    }),
    renderDictArea,
  });
}
