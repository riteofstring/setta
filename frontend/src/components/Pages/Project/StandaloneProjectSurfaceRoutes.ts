import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import {
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
} from "utils/constants";
import type { ModeRouteElements } from "../modeRouteResolver";
import { APP_ROUTE_IDS } from "../routeConfig";

type StandaloneProjectSurfaceRoute = Pick<RouteObject, "element" | "id" | "path">;

type BuildStandaloneProjectSurfaceRoutesArgs = {
  renderModeElement: (routeElements: ModeRouteElements) => ReactNode;
  routeElements: ModeRouteElements;
};

const standaloneProjectSurfaceRouteDefinitions = [
  {
    id: APP_ROUTE_IDS.projectChatThreadStandalone,
    path: PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.projectChatStandalone,
    path: PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.windowSpaceStandalone,
    path: WINDOW_SPACE_STANDALONE_ROUTER_PATH,
  },
  {
    id: APP_ROUTE_IDS.sectionStandalone,
    path: SECTION_STANDALONE_ROUTER_PATH,
  },
] as const;

export function buildStandaloneProjectSurfaceRoutes({
  renderModeElement,
  routeElements,
}: BuildStandaloneProjectSurfaceRoutesArgs): Array<StandaloneProjectSurfaceRoute> {
  return standaloneProjectSurfaceRouteDefinitions.map(({ id, path }) => ({
    id,
    path,
    element: renderModeElement(routeElements),
  }));
}
