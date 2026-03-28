import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SectionContainerBoundary } from "components/Section/Container/SectionContainerBoundary";
import { createBrowserRouter } from "react-router-dom";
import type { ModeRouteElements } from "./modeRouteResolver";
import { buildModeWrappedAppRouteStack } from "./modeWrappedAppRouteStack";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

vi.mock("components/Section/Container/SectionContainerBoundary", () => ({
  SectionContainerBoundary: vi.fn(),
}));

vi.mock("./modeWrappedAppRouteStack", () => ({
  buildModeWrappedAppRouteStack: vi.fn(),
}));
vi.mock("./modeWrappedRouterArgs", () => ({
  buildModeWrappedRouterArgs: vi.fn(),
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
  it("owns the lifted section-boundary seam above modeWrappedRouterArgs.tsx", () => {
    // The browser-router helper should now own the default section boundary
    // while still staying on the final route-stack-to-browser-router call.
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
    const mockedBuildModeWrappedRouterArgs = vi.mocked(
      buildModeWrappedRouterArgs,
    );
    const renderDictArea = vi.fn(() => <div data-testid="dict-area" />);

    const routerArgs = {
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
    mockedBuildModeWrappedRouterArgs.mockReturnValue(routerArgs);

    const router = createModeWrappedBrowserRouter({ renderDictArea });

    expect(router).toBe(browserRouter);
    expect(mockedBuildModeWrappedRouterArgs).toHaveBeenCalledOnce();
    expect(mockedBuildModeWrappedRouterArgs).toHaveBeenCalledWith({
      SectionBoundary: SectionContainerBoundary,
    });
    expect(mockedBuildModeWrappedAppRouteStack).toHaveBeenCalledOnce();
    expect(mockedBuildModeWrappedAppRouteStack).toHaveBeenCalledWith({
      ...routerArgs,
      renderDictArea,
    });
    expect(mockedCreateBrowserRouter).toHaveBeenCalledOnce();
    expect(mockedCreateBrowserRouter).toHaveBeenCalledWith(builtRouteStack);

    const routedArgs = mockedBuildModeWrappedAppRouteStack.mock.calls[0][0];
    expect(routedArgs.renderDictArea).toBe(renderDictArea);
  });
});
