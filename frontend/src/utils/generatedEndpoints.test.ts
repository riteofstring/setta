import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "./c_addresses";
import { resolveEndpointOrigin } from "./endpointUtils";
import {
  route_get_app_catalog,
  route_get_app_definition,
  route_get_launcher_recent_workspaces,
  route_get_launcher_status,
  route_set_app_definition,
  route_validate_app_definition,
} from "./generatedEndpoints";

vi.mock("state/definitions", () => ({
  useServerMode: {
    getState: () => ({
      mode: null,
      modeResolved: false,
      modeError: null,
    }),
  },
  useShareSession: {
    getState: () => ({
      isDeploymentMode: false,
      shareSessionId: null,
    }),
  },
}));

describe("generatedEndpoints launcher recent-workspaces", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("transmits setta_home as a query parameter", async () => {
    // This endpoint's backend contract uses a query param, not a path segment.
    await route_get_launcher_recent_workspaces({
      setta_home: "/tmp/launcher-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}/launcherRecentWorkspaces?setta_home=%2Ftmp%2Flauncher-home`,
    );
  });

  it("omits setta_home query parameter when null", async () => {
    await route_get_launcher_recent_workspaces({
      setta_home: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}/launcherRecentWorkspaces`,
    );
  });
});

describe("generatedEndpoints launcher status", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("transmits setta_home query via backend origin when provided", async () => {
    // Distinct origins make routing mismatches obvious in this assertion.
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );
    expect(resolveEndpointOrigin("/launcherStatus")).toBe("backend");

    await route_get_launcher_status({
      setta_home: "/tmp/launcher-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/launcherStatus?setta_home=%2Ftmp%2Flauncher-home",
    );
  });

  it("omits setta_home query and still uses backend origin when null", async () => {
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );
    expect(resolveEndpointOrigin("/launcherStatus")).toBe("backend");

    await route_get_launcher_status({
      setta_home: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/launcherStatus",
    );
  });
});

describe("generatedEndpoints app definition", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the app catalog from the backend origin", async () => {
    await route_get_app_catalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppCatalog`,
    );
  });

  it("posts app-definition reads with the request payload", async () => {
    await route_get_app_definition({ frontendOpId: "frontend-op-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/getAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ frontendOpId: "frontend-op-1" }),
    });
  });

  it("posts app-definition saves with the current payload shape", async () => {
    await route_set_app_definition({
      appSpec: { root: "root", elements: {} },
      appSpecPath: "app_specs/app.json",
      catalogId: "setta.app.default",
      theme: { mode: "dark" },
      assets: [{ type: "image", url: "/x.png" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/setAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        appSpec: { root: "root", elements: {} },
        appSpecPath: "app_specs/app.json",
        catalogId: "setta.app.default",
        theme: { mode: "dark" },
        assets: [{ type: "image", url: "/x.png" }],
      }),
    });
  });

  it("posts app-definition validation payloads to the backend origin", async () => {
    await route_validate_app_definition({
      appSpec: { root: "root", elements: {} },
      appSpecVersion: "v1",
      catalogId: "setta.app.default",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/validateAppDefinition`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        appSpec: { root: "root", elements: {} },
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
      }),
    });
  });
});
