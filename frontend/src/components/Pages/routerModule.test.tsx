import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("router module", () => {
  it("owns the lifted dict-area renderer seam above modeWrappedBrowserRouter", async () => {
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

    vi.doMock(
      "components/Section/Container/SectionContainerAreaDictBoundary",
      () => ({
        SectionContainerAreaDictBoundary: ({
          bgColor,
          sectionId,
        }: {
          bgColor: string;
          sectionId: string;
        }) => (
          <div
            data-testid="mock-section-container-area-dict-boundary"
            data-bg-color={bgColor}
            data-section-id={sectionId}
          />
        ),
      }),
    );
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
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledWith({
      ...routerArgs,
      renderDictArea: expect.any(Function),
    });
    const routedArgs = vi.mocked(createModeWrappedBrowserRouter).mock.calls[0][0];
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-testid="mock-section-container-area-dict-boundary"');
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-section-id="section-1"');
    expect(
      renderToStaticMarkup(
        <>
          {routedArgs.renderDictArea({
            sectionId: "section-1",
            bgColor: "#123456",
          })}
        </>,
      ),
    ).toContain('data-bg-color="#123456"');
    expect(router).toBe(routerValue);
  });
});
