import type { ComponentType } from "react";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedHomeProjectCatchAllRouteElements } from "./modeWrappedHomeProjectCatchAllRouteElements";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";
import { buildModeWrappedStandaloneAppLauncherRouteElements } from "./modeWrappedStandaloneAppLauncherRouteElements";

export type ModeWrappedRouterRouteElements = Pick<
  BuildModeWrappedAppRouteStackArgs,
  | "indexRouteElements"
  | "homeRouteElements"
  | "workspaceLaunchRouteElements"
  | "projectRouteElements"
  | "catchAllRouteElements"
  | "standaloneAppRouteElement"
  | "standaloneLauncherRouteElement"
>;

type BuildModeWrappedRouterRouteElementsArgs = {
  SectionBoundary: ComponentType<{ sectionId: string }>;
};

export function buildModeWrappedRouterRouteElements({
  SectionBoundary,
}: BuildModeWrappedRouterRouteElementsArgs): ModeWrappedRouterRouteElements {
  const {
    appRouteElement,
    launcherHomeRouteElement,
    standaloneAppRouteElement,
    standaloneLauncherRouteElement,
  } = buildModeWrappedStandaloneAppLauncherRouteElements();
  const { homeRouteElements, projectRouteElements, catchAllRouteElements } =
    buildModeWrappedHomeProjectCatchAllRouteElements({
      appRouteElement,
      launcherHomeRouteElement,
      SectionBoundary,
    });
  const { indexRouteElements, workspaceLaunchRouteElements } =
    buildModeWrappedIndexWorkspaceLaunchRouteElements({
      appRouteElement,
      launcherHomeRouteElement,
    });

  return {
    indexRouteElements,
    homeRouteElements,
    workspaceLaunchRouteElements,
    projectRouteElements,
    catchAllRouteElements,
    standaloneAppRouteElement,
    standaloneLauncherRouteElement,
  };
}
