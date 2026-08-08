import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("plugin runtime bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.doUnmock("utils/generatedEndpoints");
  });

  it("triggers runtime refresh only when bootstrap is enabled", async () => {
    const routePluginsRuntime = vi.fn(async () => ({
      data: {
        schemaVersion: 1,
        list: {
          schemaVersion: 1,
          serverMode: "ide",
          restartCapability: {
            mode: "manual",
            command: "setta",
            reason: "Programmatic restart is not available in this runtime.",
          },
          plugins: [],
        },
        status: {
          schemaVersion: 1,
          serverMode: "ide",
          plugins: [],
        },
      },
      status: 200,
      hasResponse: true,
    }));

    vi.doMock("utils/generatedEndpoints", async () => {
      const actual = await vi.importActual<
        typeof import("utils/generatedEndpoints")
      >("utils/generatedEndpoints");
      return {
        ...actual,
        route_plugins_runtime: routePluginsRuntime,
      };
    });

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useEffect: (effect: () => void) => {
          effect();
        },
      };
    });

    const runtime = await import("plugins/runtime");
    runtime.resetPluginRuntimeStoreForTests();

    runtime.usePluginRuntimeBootstrap(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(routePluginsRuntime).toHaveBeenCalledTimes(1);

    runtime.usePluginRuntimeBootstrap(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(routePluginsRuntime).toHaveBeenCalledTimes(1);
  });
});
