import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants";
import type { ModeRouteElements } from "./modeRouteResolver";
import { buildStandaloneProjectSurfaceAppRouteStack } from "./Project/StandaloneProjectSurfaceAppRouteStack";
import type { StandaloneProjectSurfaceRouteElementsArgs } from "./Project/StandaloneProjectSurfaceRouteElements";
import { APP_ROUTE_IDS } from "./routeConfig";

type AppRoute = Pick<RouteObject, "element" | "id" | "path">;

export type BuildModeWrappedAppRouteStackArgs = {
  renderDictArea: StandaloneProjectSurfaceRouteElementsArgs["renderDictArea"];
  renderModeElement: (routeElements: ModeRouteElements) => ReactNode;
  indexRouteElements: ModeRouteElements;
  homeRouteElements: ModeRouteElements;
  workspaceLaunchRouteElements: ModeRouteElements;
  projectRouteElements: ModeRouteElements;
  viewModeRouteElements: ModeRouteElements;
  catchAllRouteElements: ModeRouteElements;
  standaloneAppRouteElement: ReactNode;
  standaloneLauncherRouteElement: ReactNode;
};

function createModeWrappedRoute(
  id: string,
  path: string,
  routeElements: ModeRouteElements,
  renderModeElement: (routeElements: ModeRouteElements) => ReactNode,
): AppRoute {
  return {
    id,
    path,
    element: renderModeElement(routeElements),
  };
}

export function buildModeWrappedAppRouteStack({
  renderDictArea,
  renderModeElement,
  indexRouteElements,
  homeRouteElements,
  workspaceLaunchRouteElements,
  projectRouteElements,
  viewModeRouteElements,
  catchAllRouteElements,
  standaloneAppRouteElement,
  standaloneLauncherRouteElement,
}: BuildModeWrappedAppRouteStackArgs): Array<AppRoute> {
  return buildStandaloneProjectSurfaceAppRouteStack({
    app: standaloneAppRouteElement,
    launcher: standaloneLauncherRouteElement,
    renderDictArea,
    renderModeElement,
    indexRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.index,
      INDEX_ROUTER_PATH,
      indexRouteElements,
      renderModeElement,
    ),
    homeRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.home,
      HOME_ROUTER_PATH,
      homeRouteElements,
      renderModeElement,
    ),
    workspaceLaunchRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.workspaceLaunch,
      WORKSPACE_LAUNCH_ROUTER_PATH,
      workspaceLaunchRouteElements,
      renderModeElement,
    ),
    viewModeRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.viewMode,
      VIEW_MODE_ROUTER_PATH,
      viewModeRouteElements,
      renderModeElement,
    ),
    projectRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.project,
      PROJECT_CONFIG_ROUTER_PATH,
      projectRouteElements,
      renderModeElement,
    ),
    catchAllRoute: createModeWrappedRoute(
      APP_ROUTE_IDS.catchAll,
      "*",
      catchAllRouteElements,
      renderModeElement,
    ),
  });
}
