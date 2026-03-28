import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("App", () => {
  it("owns only the RouterProvider seam below index.tsx", async () => {
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
