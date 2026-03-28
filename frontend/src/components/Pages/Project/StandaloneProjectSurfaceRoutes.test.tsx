import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PROJECT_CHAT_STANDALONE_ROUTER_PATH,
  PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH,
  SECTION_STANDALONE_ROUTER_PATH,
  WINDOW_SPACE_STANDALONE_ROUTER_PATH,
} from "utils/constants";
import { APP_ROUTE_IDS } from "../routeConfig";
import type { ModeRouteElements } from "../modeRouteResolver";
import { buildStandaloneProjectSurfaceRoutes } from "./StandaloneProjectSurfaceRoutes";

describe("buildStandaloneProjectSurfaceRoutes", () => {
  it("keeps the standalone route objects in canonical order and renders each through the caller boundary", () => {
    const routeElements: ModeRouteElements = {
      ide: <div data-testid="mock-ide-route" />,
      share: <div data-testid="mock-share-route" />,
      app: <div data-testid="mock-app-route" />,
      launcher: <div data-testid="mock-launcher-route" />,
    };
    let renderCount = 0;
    const renderModeElement = vi.fn(
      (elements: ModeRouteElements): ReactNode => {
        renderCount += 1;
        return (
          <div
            data-testid={`mock-standalone-route-${renderCount}`}
            data-share-route={String(elements.share !== null)}
          />
        );
      },
    );

    const routes = buildStandaloneProjectSurfaceRoutes({
      routeElements,
      renderModeElement,
    });

    expect(routes.map(({ id, path }) => ({ id, path }))).toEqual([
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
    ]);

    expect(renderModeElement).toHaveBeenCalledTimes(4);
    expect(renderModeElement).toHaveBeenNthCalledWith(1, routeElements);
    expect(renderModeElement).toHaveBeenNthCalledWith(2, routeElements);
    expect(renderModeElement).toHaveBeenNthCalledWith(3, routeElements);
    expect(renderModeElement).toHaveBeenNthCalledWith(4, routeElements);

    const routeMarkup = routes.map(({ element }) =>
      renderToStaticMarkup(<>{element}</>),
    );

    expect(routeMarkup).toEqual([
      expect.stringContaining('data-testid="mock-standalone-route-1"'),
      expect.stringContaining('data-testid="mock-standalone-route-2"'),
      expect.stringContaining('data-testid="mock-standalone-route-3"'),
      expect.stringContaining('data-testid="mock-standalone-route-4"'),
    ]);
  });
});
