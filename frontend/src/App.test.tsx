import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("App", () => {
  it("owns the lifted section-boundary seam above router.tsx", async () => {
    const router = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const renderDictArea = vi.fn();
    const SectionContainerBoundary = vi.fn();

    vi.doMock("components/Pages/router", () => ({
      createAppRouter: vi.fn(() => router),
    }));
    vi.doMock("components/Section/Container/SectionContainerBoundary", () => ({
      SectionContainerBoundary,
    }));

    const { buildAppProps } = await import("./App");
    const { createAppRouter } = await import("components/Pages/router");

    expect(buildAppProps({ renderDictArea })).toEqual({ router });
    expect(createAppRouter).toHaveBeenCalledOnce();
    expect(createAppRouter).toHaveBeenCalledWith({
      SectionBoundary: SectionContainerBoundary,
      renderDictArea,
    });
  });

  it("owns only the final RouterProvider seam below buildAppProps", async () => {
    vi.doMock("react-router-dom", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react-router-dom")>();
      return {
        ...actual,
        RouterProvider: vi.fn(() => <div data-testid="mock-router-provider" />),
      };
    });

    const { App } = await import("./App");
    const { RouterProvider, createMemoryRouter } = await import(
      "react-router-dom"
    );
    const router = createMemoryRouter([
      {
        path: "/",
        element: <div data-testid="mock-route" />,
      },
    ]);

    const rendered = renderToStaticMarkup(<App router={router} />);
    expect(rendered).toContain('data-testid="mock-router-provider"');
    expect(RouterProvider).toHaveBeenCalledOnce();
    expect(vi.mocked(RouterProvider).mock.calls[0][0]).toMatchObject({
      router,
    });
  });
});
