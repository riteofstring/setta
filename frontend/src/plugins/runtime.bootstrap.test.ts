import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("plugin runtime bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.doUnmock("openapi/http");
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
      response: new Response(null, { status: 200 }),
    }));

    vi.doMock("openapi/http", async () => {
      const actual =
        await vi.importActual<typeof import("openapi/http")>("openapi/http");
      return {
        ...actual,
        getPluginsRuntime: routePluginsRuntime,
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
