import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { buildStandaloneProjectSurfaceAppRoutes } from "./StandaloneProjectSurfaceAppRoutes";

type MockRoute = {
  element: ReactElement;
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

describe("buildStandaloneProjectSurfaceAppRoutes", () => {
  it("keeps the standalone surface routes inserted between workspace launch and view mode without cloning callers", () => {
    const indexRoute = createRoute("index", "/");
    const homeRoute = createRoute("home", "/home");
    const workspaceLaunchRoute = createRoute("workspace-launch", "/launching");
    const standaloneProjectSurfaceRoutes = [
      createRoute("project-chat-thread-standalone", "/demo/chat/thread-123"),
      createRoute("project-chat-standalone", "/demo/chat"),
      createRoute("window-space-standalone", "/demo/windowspace/research"),
      createRoute("section-standalone", "/demo/section/languageserver"),
    ];
    const viewModeRoute = createRoute("view-mode", "/demo/view/analysis");
    const projectRoute = createRoute("project", "/demo");
    const catchAllRoute = createRoute("catch-all", "*");

    const routes = buildStandaloneProjectSurfaceAppRoutes({
      indexRoute,
      homeRoute,
      workspaceLaunchRoute,
      standaloneProjectSurfaceRoutes,
      viewModeRoute,
      projectRoute,
      catchAllRoute,
    });

    expect(routes.map(({ id }) => id)).toEqual([
      "index",
      "home",
      "workspace-launch",
      "project-chat-thread-standalone",
      "project-chat-standalone",
      "window-space-standalone",
      "section-standalone",
      "view-mode",
      "project",
      "catch-all",
    ]);

    expect(routes[0]).toBe(indexRoute);
    expect(routes[1]).toBe(homeRoute);
    expect(routes[2]).toBe(workspaceLaunchRoute);
    expect(routes[3]).toBe(standaloneProjectSurfaceRoutes[0]);
    expect(routes[4]).toBe(standaloneProjectSurfaceRoutes[1]);
    expect(routes[5]).toBe(standaloneProjectSurfaceRoutes[2]);
    expect(routes[6]).toBe(standaloneProjectSurfaceRoutes[3]);
    expect(routes[7]).toBe(viewModeRoute);
    expect(routes[8]).toBe(projectRoute);
    expect(routes[9]).toBe(catchAllRoute);
  });
});
