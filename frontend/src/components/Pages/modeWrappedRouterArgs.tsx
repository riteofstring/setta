import { ModeWrappedRouteBoundary } from "./ModeWrappedRouteBoundary";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";
import { buildModeWrappedHomeProjectCatchAllRouteElements } from "./modeWrappedHomeProjectCatchAllRouteElements";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";
import { buildModeWrappedStandaloneAppLauncherRouteElements } from "./modeWrappedStandaloneAppLauncherRouteElements";

export function buildModeWrappedRouterArgs(): BuildModeWrappedAppRouteStackArgs {
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
    });
  const { indexRouteElements, workspaceLaunchRouteElements } =
    buildModeWrappedIndexWorkspaceLaunchRouteElements({
      appRouteElement,
      launcherHomeRouteElement,
    });

  return {
    renderModeElement: (routeElements) => (
      <ModeWrappedRouteBoundary {...routeElements} />
    ),
    indexRouteElements,
    homeRouteElements,
    workspaceLaunchRouteElements,
    projectRouteElements,
    viewModeRouteElements: projectRouteElements,
    catchAllRouteElements,
    standaloneAppRouteElement,
    standaloneLauncherRouteElement,
  };
}
