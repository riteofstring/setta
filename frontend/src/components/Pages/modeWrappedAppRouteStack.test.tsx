import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HOME_ROUTER_PATH,
  INDEX_ROUTER_PATH,
  PROJECT_CONFIG_ROUTER_PATH,
  VIEW_MODE_ROUTER_PATH,
  WORKSPACE_LAUNCH_ROUTER_PATH,
} from "utils/constants";
import { describe, expect, it, vi } from "vitest";
import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedAppRouteStack } from "./modeWrappedAppRouteStack";
import { buildStandaloneProjectSurfaceAppRouteStack } from "./Project/StandaloneProjectSurfaceAppRouteStack";
import { APP_ROUTE_IDS } from "./routeConfig";

vi.mock("./Project/StandaloneProjectSurfaceAppRouteStack", () => ({
  buildStandaloneProjectSurfaceAppRouteStack: vi.fn(),
}));

function createModeRouteElements(label: string): ModeRouteElements {
  return {
    ide: <div data-testid={`${label}-ide`} />,
    share: <div data-testid={`${label}-share`} />,
    app: <div data-testid={`${label}-app`} />,
    launcher: <div data-testid={`${label}-launcher`} />,
  };
}

describe("buildModeWrappedAppRouteStack", () => {
  it("owns the lifted top-level route-group assembly above router.tsx", () => {
    // The helper should be the only caller that turns route-element groups
    // into the top-level route objects before the standalone stack helper.
    const standaloneRoutes = [
      {
        id: "mock-standalone-stack",
        path: "/mock",
        element: <div data-testid="mock-standalone-stack" />,
      },
    ];
    const mockedBuildStandaloneProjectSurfaceAppRouteStack = vi.mocked(
      buildStandaloneProjectSurfaceAppRouteStack,
    );
    mockedBuildStandaloneProjectSurfaceAppRouteStack.mockReturnValue(
      standaloneRoutes,
    );

    const indexRouteElements = createModeRouteElements("index");
    const homeRouteElements = createModeRouteElements("home");
    const workspaceLaunchRouteElements =
      createModeRouteElements("workspace-launch");
    const projectRouteElements = createModeRouteElements("project");
    const viewModeRouteElements = createModeRouteElements("view-mode");
    const catchAllRouteElements = createModeRouteElements("catch-all");
    const standaloneAppRouteElement = (
      <div data-testid="standalone-app-route" />
    );
    const standaloneLauncherRouteElement = (
      <div data-testid="standalone-launcher-route" />
    );
    const renderDictArea = vi.fn(
      ({
        bgColor,
        sectionId,
      }: {
        bgColor: string;
        sectionId: string;
      }) => (
        <div
          data-testid="caller-owned-render-dict-area"
          data-bg-color={bgColor}
          data-section-id={sectionId}
        />
      ),
    );
    let renderCount = 0;
    const renderModeElement = vi.fn(
      (routeElements: ModeRouteElements): ReactNode => {
        renderCount += 1;
        return (
          <div
            data-testid={`wrapped-route-${renderCount}`}
            data-ide-route={routeElements.ide !== null}
            data-share-route={routeElements.share !== null}
            data-app-route={routeElements.app !== null}
            data-launcher-route={routeElements.launcher !== null}
          />
        );
      },
    );

    const routes = buildModeWrappedAppRouteStack({
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
    });

    expect(routes).toBe(standaloneRoutes);
    expect(renderModeElement).toHaveBeenCalledTimes(6);
    expect(
      renderModeElement.mock.calls.map(([routeElements]) => routeElements),
    ).toEqual([
      indexRouteElements,
      homeRouteElements,
      workspaceLaunchRouteElements,
      viewModeRouteElements,
      projectRouteElements,
      catchAllRouteElements,
    ]);

    expect(
      mockedBuildStandaloneProjectSurfaceAppRouteStack,
    ).toHaveBeenCalledOnce();
    expect(
      mockedBuildStandaloneProjectSurfaceAppRouteStack,
    ).toHaveBeenCalledWith({
      app: standaloneAppRouteElement,
      launcher: standaloneLauncherRouteElement,
      renderDictArea,
      renderModeElement,
      indexRoute: {
        id: APP_ROUTE_IDS.index,
        path: INDEX_ROUTER_PATH,
        element: expect.anything(),
      },
      homeRoute: {
        id: APP_ROUTE_IDS.home,
        path: HOME_ROUTER_PATH,
        element: expect.anything(),
      },
      workspaceLaunchRoute: {
        id: APP_ROUTE_IDS.workspaceLaunch,
        path: WORKSPACE_LAUNCH_ROUTER_PATH,
        element: expect.anything(),
      },
      viewModeRoute: {
        id: APP_ROUTE_IDS.viewMode,
        path: VIEW_MODE_ROUTER_PATH,
        element: expect.anything(),
      },
      projectRoute: {
        id: APP_ROUTE_IDS.project,
        path: PROJECT_CONFIG_ROUTER_PATH,
        element: expect.anything(),
      },
      catchAllRoute: {
        id: APP_ROUTE_IDS.catchAll,
        path: "*",
        element: expect.anything(),
      },
    });

    const routedArgs =
      mockedBuildStandaloneProjectSurfaceAppRouteStack.mock.calls[0][0];
    expect(routedArgs.renderDictArea).toBe(renderDictArea);
    expect(
      renderToStaticMarkup(<>{routedArgs.indexRoute.element}</>),
    ).toContain('data-testid="wrapped-route-1"');
    expect(renderToStaticMarkup(<>{routedArgs.homeRoute.element}</>)).toContain(
      'data-testid="wrapped-route-2"',
    );
    expect(
      renderToStaticMarkup(<>{routedArgs.workspaceLaunchRoute.element}</>),
    ).toContain('data-testid="wrapped-route-3"');
    expect(
      renderToStaticMarkup(<>{routedArgs.viewModeRoute.element}</>),
    ).toContain('data-testid="wrapped-route-4"');
    expect(
      renderToStaticMarkup(<>{routedArgs.projectRoute.element}</>),
    ).toContain('data-testid="wrapped-route-5"');
    expect(
      renderToStaticMarkup(<>{routedArgs.catchAllRoute.element}</>),
    ).toContain('data-testid="wrapped-route-6"');
  });
});
