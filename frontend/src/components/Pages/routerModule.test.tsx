import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("router module", () => {
  it("accepts a caller-owned section boundary above modeWrappedBrowserRouter", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const renderDictArea = vi.fn();
    const MockSectionBoundary = ({ sectionId }: { sectionId: string }) => (
      <div data-testid="mock-section-boundary" data-section-id={sectionId} />
    );
    const routerArgs = {
      renderModeElement: vi.fn(() => null),
      indexRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      homeRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      workspaceLaunchRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      projectRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      viewModeRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      catchAllRouteElements: {
        ide: <div />,
        share: <div />,
        app: <div />,
        launcher: <div />,
      },
      standaloneAppRouteElement: <div />,
      standaloneLauncherRouteElement: <div />,
    };

    vi.doMock("./modeWrappedBrowserRouter", () => ({
      createModeWrappedBrowserRouter: vi.fn(() => routerValue),
    }));
    vi.doMock("./modeWrappedRouterArgs", () => ({
      buildModeWrappedRouterArgs: vi.fn(() => routerArgs),
    }));

    const { createAppRouter } = await import("./router");
    const { createModeWrappedBrowserRouter } = await import(
      "./modeWrappedBrowserRouter"
    );
    const { buildModeWrappedRouterArgs } = await import(
      "./modeWrappedRouterArgs"
    );

    const router = createAppRouter({
      SectionBoundary: MockSectionBoundary,
      renderDictArea,
    });
    expect(router).toBe(routerValue);
    expect(buildModeWrappedRouterArgs).toHaveBeenCalledOnce();
    expect(buildModeWrappedRouterArgs).toHaveBeenCalledWith({
      SectionBoundary: MockSectionBoundary,
    });
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledOnce();
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledWith({
      ...routerArgs,
      renderDictArea,
    });
  });
});
