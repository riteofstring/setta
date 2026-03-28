import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import type { ModeRouteElements } from "../modeRouteResolver";
import { buildStandaloneProjectSurfaceAppRoutes } from "./StandaloneProjectSurfaceAppRoutes";
import { buildStandaloneProjectSurfaceRouteElements } from "./StandaloneProjectSurfaceRouteElements";
import { buildStandaloneProjectSurfaceRoutes } from "./StandaloneProjectSurfaceRoutes";

type AppRoute = Pick<RouteObject, "element" | "id" | "path">;

type BuildStandaloneProjectSurfaceAppRouteStackArgs = {
  app: ReactNode;
  launcher: ReactNode;
  renderModeElement: (routeElements: ModeRouteElements) => ReactNode;
  indexRoute: AppRoute;
  homeRoute: AppRoute;
  workspaceLaunchRoute: AppRoute;
  viewModeRoute: AppRoute;
  projectRoute: AppRoute;
  catchAllRoute: AppRoute;
};

function renderStandaloneProjectSurfaceRouteDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

export function buildStandaloneProjectSurfaceAppRouteStack({
  app,
  launcher,
  renderModeElement,
  indexRoute,
  homeRoute,
  workspaceLaunchRoute,
  viewModeRoute,
  projectRoute,
  catchAllRoute,
}: BuildStandaloneProjectSurfaceAppRouteStackArgs): Array<AppRoute> {
  const standaloneProjectSurfaceRouteElements =
    buildStandaloneProjectSurfaceRouteElements({
      app,
      launcher,
      renderDictArea: renderStandaloneProjectSurfaceRouteDictArea,
    });

  const standaloneProjectSurfaceRoutes = buildStandaloneProjectSurfaceRoutes({
    routeElements: standaloneProjectSurfaceRouteElements,
    renderModeElement,
  });

  return buildStandaloneProjectSurfaceAppRoutes({
    indexRoute,
    homeRoute,
    workspaceLaunchRoute,
    standaloneProjectSurfaceRoutes,
    viewModeRoute,
    projectRoute,
    catchAllRoute,
  });
}
