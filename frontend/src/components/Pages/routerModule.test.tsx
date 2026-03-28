import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("router module", () => {
  it("owns only the final browser-router creation call above the lifted args helper", async () => {
    const routerArgs = {
      renderModeElement: vi.fn(),
      indexRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      homeRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      workspaceLaunchRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      projectRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      viewModeRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      catchAllRouteElements: {
        ide: null,
        share: null,
        app: null,
        launcher: null,
      },
      standaloneAppRouteElement: null,
      standaloneLauncherRouteElement: null,
    };
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };

    vi.doMock("./modeWrappedRouterArgs", () => ({
      buildModeWrappedRouterArgs: vi.fn(() => routerArgs),
    }));
    vi.doMock("./modeWrappedBrowserRouter", () => ({
      createModeWrappedBrowserRouter: vi.fn(() => routerValue),
    }));

    const { router } = await import("./router");
    const { buildModeWrappedRouterArgs } = await import("./modeWrappedRouterArgs");
    const { createModeWrappedBrowserRouter } = await import(
      "./modeWrappedBrowserRouter"
    );

    expect(buildModeWrappedRouterArgs).toHaveBeenCalledOnce();
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledOnce();
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledWith(routerArgs);
    expect(router).toBe(routerValue);
  });
});
