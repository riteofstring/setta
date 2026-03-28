import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("router module", () => {
  it("owns only the browser-router handoff above modeWrappedBrowserRouter", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const renderDictArea = vi.fn();

    vi.doMock("./modeWrappedBrowserRouter", () => ({
      createModeWrappedBrowserRouter: vi.fn(() => routerValue),
    }));

    const { createAppRouter } = await import("./router");
    const { createModeWrappedBrowserRouter } = await import(
      "./modeWrappedBrowserRouter"
    );

    const router = createAppRouter({ renderDictArea });
    expect(router).toBe(routerValue);
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledOnce();
    expect(createModeWrappedBrowserRouter).toHaveBeenCalledWith({
      renderDictArea,
    });
  });
});
