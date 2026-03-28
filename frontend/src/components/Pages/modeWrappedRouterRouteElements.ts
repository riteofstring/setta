import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
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

export function buildModeWrappedRouterRouteElements(): ModeWrappedRouterRouteElements {
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
      SectionBoundary: SectionContainerBoundary,
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
