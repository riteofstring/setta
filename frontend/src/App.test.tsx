import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("App", () => {
  it("owns the lifted dict-area renderer seam above router.tsx", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };

    vi.doMock("components/Pages/router", () => ({
      createAppRouter: vi.fn(() => routerValue),
    }));
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
    vi.doMock("react-router-dom", () => ({
      RouterProvider: vi.fn(() => <div data-testid="mock-router-provider" />),
    }));

    const { App } = await import("./App");
    const { createAppRouter } = await import("components/Pages/router");
    const { RouterProvider } = await import("react-router-dom");

    expect(createAppRouter).toHaveBeenCalledOnce();
    expect(createAppRouter).toHaveBeenCalledWith({
      renderDictArea: expect.any(Function),
    });

    const routedArgs = vi.mocked(createAppRouter).mock.calls[0][0];
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

    const rendered = renderToStaticMarkup(<App />);
    expect(rendered).toContain('data-testid="mock-router-provider"');
    expect(RouterProvider).toHaveBeenCalledOnce();
    expect(vi.mocked(RouterProvider).mock.calls[0][0]).toMatchObject({
      router: routerValue,
    });
  });
});
