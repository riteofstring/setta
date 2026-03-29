import type { RouteObject } from "react-router-dom";

type AppRoute = Pick<RouteObject, "element" | "id" | "path">;

type BuildStandaloneProjectSurfaceAppRoutesArgs = {
  indexRoute: AppRoute;
  homeRoute: AppRoute;
  workspaceLaunchRoute: AppRoute;
  standaloneProjectSurfaceRoutes: Array<AppRoute>;
  viewModeRoute: AppRoute;
  projectRoute: AppRoute;
  catchAllRoute: AppRoute;
};

export function buildStandaloneProjectSurfaceAppRoutes({
  indexRoute,
  homeRoute,
  workspaceLaunchRoute,
  standaloneProjectSurfaceRoutes,
  viewModeRoute,
  projectRoute,
  catchAllRoute,
}: BuildStandaloneProjectSurfaceAppRoutesArgs): Array<AppRoute> {
  return [
    indexRoute,
    homeRoute,
    workspaceLaunchRoute,
    ...standaloneProjectSurfaceRoutes,
    viewModeRoute,
    projectRoute,
    catchAllRoute,
  ];
}
