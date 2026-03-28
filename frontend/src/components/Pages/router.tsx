import { ModeWrappedRouteBoundary } from "./ModeWrappedRouteBoundary";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedHomeProjectCatchAllRouteElements } from "./modeWrappedHomeProjectCatchAllRouteElements";
import { buildModeWrappedIndexWorkspaceLaunchRouteElements } from "./modeWrappedIndexWorkspaceLaunchRouteElements";
import { buildModeWrappedStandaloneAppLauncherRouteElements } from "./modeWrappedStandaloneAppLauncherRouteElements";

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

export const router = createModeWrappedBrowserRouter({
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
});
