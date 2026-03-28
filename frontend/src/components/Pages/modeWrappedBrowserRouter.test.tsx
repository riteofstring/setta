import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createBrowserRouter } from "react-router-dom";
import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedAppRouteStack } from "./modeWrappedAppRouteStack";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";

vi.mock("./modeWrappedAppRouteStack", () => ({
  buildModeWrappedAppRouteStack: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    createBrowserRouter: vi.fn(),
  };
});

function createModeRouteElements(label: string): ModeRouteElements {
  return {
    ide: <div data-testid={`${label}-ide`} />,
    share: <div data-testid={`${label}-share`} />,
    app: <div data-testid={`${label}-app`} />,
    launcher: <div data-testid={`${label}-launcher`} />,
  };
}

describe("createModeWrappedBrowserRouter", () => {
  it("owns the lifted browser-router creation seam above router.tsx", () => {
    // The helper should be the only boundary that feeds the assembled
    // mode-wrapped app route stack into createBrowserRouter.
    const builtRouteStack = [
      {
        id: "mock-route",
        path: "/mock",
        element: <div data-testid="mock-route" />,
      },
    ];
    const browserRouter = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as ReturnType<typeof createBrowserRouter>;

    const mockedBuildModeWrappedAppRouteStack = vi.mocked(
      buildModeWrappedAppRouteStack,
    );
    mockedBuildModeWrappedAppRouteStack.mockReturnValue(builtRouteStack);

    const mockedCreateBrowserRouter = vi.mocked(createBrowserRouter);
    mockedCreateBrowserRouter.mockReturnValue(browserRouter);

    const args = {
      renderModeElement: (routeElements: ModeRouteElements): ReactNode => (
        <div data-ide-route={routeElements.ide !== null} />
      ),
      indexRouteElements: createModeRouteElements("index"),
      homeRouteElements: createModeRouteElements("home"),
      workspaceLaunchRouteElements: createModeRouteElements("workspace-launch"),
      projectRouteElements: createModeRouteElements("project"),
      viewModeRouteElements: createModeRouteElements("view-mode"),
      catchAllRouteElements: createModeRouteElements("catch-all"),
      standaloneAppRouteElement: <div data-testid="standalone-app-route" />,
      standaloneLauncherRouteElement: (
        <div data-testid="standalone-launcher-route" />
      ),
    };

    const router = createModeWrappedBrowserRouter(args);

    expect(router).toBe(browserRouter);
    expect(mockedBuildModeWrappedAppRouteStack).toHaveBeenCalledOnce();
    expect(mockedBuildModeWrappedAppRouteStack).toHaveBeenCalledWith(args);
    expect(mockedCreateBrowserRouter).toHaveBeenCalledOnce();
    expect(mockedCreateBrowserRouter).toHaveBeenCalledWith(builtRouteStack);
  });
});
