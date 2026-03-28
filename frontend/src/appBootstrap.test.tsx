import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("appBootstrap", () => {
  it("accepts a caller-owned section boundary above appBootstrap.tsx", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const buildAppProps = vi.fn(() => ({ router: routerValue }));
    const SectionBoundary = vi.fn();
    const renderDictArea = vi.fn();

    vi.doMock("./App", () => ({
      buildAppProps,
    }));

    const { buildBootstrapAppProps } = await import("./appBootstrap");

    expect(
      buildBootstrapAppProps({
        SectionBoundary,
        renderDictArea,
      }),
    ).toEqual({ router: routerValue });
    expect(buildAppProps).toHaveBeenCalledOnce();
    expect(buildAppProps).toHaveBeenCalledWith({
      SectionBoundary,
      renderDictArea,
    });
  });
});
