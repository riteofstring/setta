import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("appRuntimeBootstrap", () => {
  it("accepts a caller-owned section boundary above appRuntimeBootstrap.tsx", async () => {
    const routerValue = {
      dispose: vi.fn(),
      navigate: vi.fn(),
      revalidate: vi.fn(),
      subscribe: vi.fn(),
    };
    const buildBootstrapAppProps = vi.fn(() => ({ router: routerValue }));
    const SectionBoundary = vi.fn();
    const renderDictArea = vi.fn();

    vi.doMock("./appBootstrap", () => ({
      buildBootstrapAppProps,
    }));

    const { buildRuntimeBootstrapAppProps } = await import(
      "./appRuntimeBootstrap"
    );

    expect(
      buildRuntimeBootstrapAppProps({
        SectionBoundary,
        renderDictArea,
      }),
    ).toEqual({ router: routerValue });
    expect(buildBootstrapAppProps).toHaveBeenCalledOnce();
    expect(buildBootstrapAppProps).toHaveBeenCalledWith({
      SectionBoundary,
      renderDictArea,
    });
  });
});
