import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
} from "utils/constants";
import { describe, expect, it, vi } from "vitest";
import type { ModeRouteElements } from "../modeRouteResolver";
import { APP_ROUTE_IDS } from "../routeConfig";
import { buildStandaloneProjectSurfaceAppRouteStack } from "./StandaloneProjectSurfaceAppRouteStack";
import type { StandaloneProjectSurfaceRouteElementsArgs } from "./StandaloneProjectSurfaceRouteElements";

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-modal-container">{children}</div>
  ),
}));

vi.mock("../GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-global-wrapper">{children}</div>
  ),
}));

vi.mock("./StandaloneProjectSurfacePage", () => ({
  StandaloneProjectSurfacePage: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-page"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

vi.mock("./ShareStandaloneProjectSurfacePage", () => ({
  ShareStandaloneProjectSurfacePage: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-share-standalone-project-surface-page"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

type MockRoute = {
  element: ReactNode;
  id: string;
  path: string;
};

function createRoute(id: string, path: string): MockRoute {
  return {
    id,
    path,
    element: <div data-testid={id} />,
  };
}

describe("buildStandaloneProjectSurfaceAppRouteStack", () => {
  it("owns the lifted standalone route-stack assembly above router while preserving caller route objects", () => {
    // The higher-level helper should be the only caller that composes
    // route elements, standalone route objects, and app-route insertion.
    const indexRoute = createRoute("index", "/");
    const homeRoute = createRoute("home", "/home");
    const workspaceLaunchRoute = createRoute("workspace-launch", "/launching");
    const viewModeRoute = createRoute("view-mode", "/demo/view/analysis");
    const projectRoute = createRoute("project", "/demo");
    const catchAllRoute = createRoute("catch-all", "*");
    const appRoute = <div data-testid="mock-app-route" />;
    const launcherRoute = <div data-testid="mock-launcher-route" />;
    const renderDictArea: StandaloneProjectSurfaceRouteElementsArgs["renderDictArea"] =
      () => <div data-testid="mock-render-dict-area" />;
    let renderCount = 0;
    const ideMarkupByRender = new Array<string>();
    const shareMarkupByRender = new Array<string>();
    const renderModeElement = vi.fn(
      (routeElements: ModeRouteElements): ReactNode => {
        renderCount += 1;
        expect(routeElements.app).toBe(appRoute);
        expect(routeElements.launcher).toBe(launcherRoute);
        expect(routeElements.ide).not.toBeNull();
        expect(routeElements.share).not.toBeNull();
        ideMarkupByRender.push(renderToStaticMarkup(<>{routeElements.ide}</>));
        shareMarkupByRender.push(
          renderToStaticMarkup(<>{routeElements.share}</>),
        );
        return <div data-testid={`mock-standalone-route-${renderCount}`} />;
      },
    );

    const routes = buildStandaloneProjectSurfaceAppRouteStack({
      app: appRoute,
      launcher: launcherRoute,
      renderDictArea,
      renderModeElement,
      indexRoute,
      homeRoute,
      workspaceLaunchRoute,
      viewModeRoute,
      projectRoute,
      catchAllRoute,
    });

    expect(routes.map(({ id, path }) => ({ id, path }))).toEqual([
      { id: "index", path: "/" },
      { id: "home", path: "/home" },
      { id: "workspace-launch", path: "/launching" },
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
      { id: "view-mode", path: "/demo/view/analysis" },
      { id: "project", path: "/demo" },
      { id: "catch-all", path: "*" },
    ]);

    expect(renderModeElement).toHaveBeenCalledTimes(4);
    expect(ideMarkupByRender).toEqual(
      Array.from({ length: 4 }, () =>
        expect.stringContaining('data-has-render-dict-area="true"'),
      ),
    );
    expect(shareMarkupByRender).toEqual(
      Array.from({ length: 4 }, () =>
        expect.stringContaining('data-has-render-dict-area="true"'),
      ),
    );
    expect(routes[0]).toBe(indexRoute);
    expect(routes[1]).toBe(homeRoute);
    expect(routes[2]).toBe(workspaceLaunchRoute);
    expect(routes[7]).toBe(viewModeRoute);
    expect(routes[8]).toBe(projectRoute);
    expect(routes[9]).toBe(catchAllRoute);

    const standaloneRouteMarkup = routes
      .slice(3, 7)
      .map(({ element }) => renderToStaticMarkup(<>{element}</>));

    expect(standaloneRouteMarkup).toEqual([
      expect.stringContaining('data-testid="mock-standalone-route-1"'),
      expect.stringContaining('data-testid="mock-standalone-route-2"'),
      expect.stringContaining('data-testid="mock-standalone-route-3"'),
      expect.stringContaining('data-testid="mock-standalone-route-4"'),
    ]);
  });
});
