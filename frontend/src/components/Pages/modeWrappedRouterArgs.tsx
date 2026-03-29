import type { ComponentType } from "react";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedRouteBoundaryArgs } from "./modeWrappedRouteBoundaryArgs";
import { buildModeWrappedRouterRouteElements } from "./modeWrappedRouterRouteElements";

export type BuildModeWrappedRouterArgs = Omit<
  BuildModeWrappedAppRouteStackArgs,
  "renderDictArea"
>;

type BuildModeWrappedRouterArgsInput = {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function buildModeWrappedRouterArgs({
  SectionBoundary,
}: BuildModeWrappedRouterArgsInput): BuildModeWrappedRouterArgs {
  const routeElements = buildModeWrappedRouterRouteElements({
    SectionBoundary,
  });
  const routeBoundaryArgs = buildModeWrappedRouteBoundaryArgs({
    projectRouteElements: routeElements.projectRouteElements,
  });

  return {
    ...routeElements,
    ...routeBoundaryArgs,
  };
}
