import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServerMode } from "state/definitions";
import { C_ADDRESSES } from "./c_addresses";
import { post } from "./requestTransport";
import {
  BINARY_TRANSPORT_ROUTES,
  LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES,
  ROOT_TRANSPORT_ROUTES,
  SERVER_MODE_BOUNDARY_ROUTES,
  STATUS_TRANSPORT_ROUTES,
} from "./transportRouteConstants";

describe("requestTransport post URL routing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useServerMode.setState({
      mode: null,
      modeResolved: true,
      modeError: null,
    });
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

  it("routes revealPathInOsFileExplorer via backend origin", async () => {
    await post(STATUS_TRANSPORT_ROUTES.revealPathInOsFileExplorer, {
      path: "/tmp/example",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${STATUS_TRANSPORT_ROUTES.revealPathInOsFileExplorer}`,
    );
  });

  it("routes launcher repair/update/remove via backend origin", async () => {
    await post(LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.repairLauncher, {});
    await post(LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.updateLauncher, {
      packageSpec: "setta",
    });
    await post(LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.removeLauncher, {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.repairLauncher}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.updateLauncher}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${LAUNCHER_MANAGEMENT_TRANSPORT_ROUTES.removeLauncher}`,
    );
  });

  it("routes launcher-home APIs via launcher origin", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.listLauncherDirectory, {
      path: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.openLauncherWorkspace, {
      workspaceRoot: "/tmp/example",
      createIfMissing: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${SERVER_MODE_BOUNDARY_ROUTES.listLauncherDirectory}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${SERVER_MODE_BOUNDARY_ROUTES.openLauncherWorkspace}`,
    );
  });

  it("routes launch endpoint via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.launch}`,
    );
  });

  it("routes launch endpoint via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${SERVER_MODE_BOUNDARY_ROUTES.launch}`,
    );
  });

  it("routes launch endpoint via backend origin while mode is unresolved", async () => {
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.launch}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent, {
      launchRequest: { workspaceRoot: "/tmp/workspace" },
      returnUrl: "http://localhost/home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent, {
      launchRequest: { workspaceRoot: "/tmp/workspace" },
      returnUrl: "http://localhost/home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent}`,
    );
  });

  it("routes launch endpoints via backend origin in blocked modes", async () => {
    const blockedModes = ["app", "share"] as const;
    for (const mode of blockedModes) {
      useServerMode.setState({
        mode,
        modeResolved: true,
        modeError: null,
      });
      await post(SERVER_MODE_BOUNDARY_ROUTES.launch, {
        launchIntentToken: "intent-token",
      });
      await post(SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent, {
        launchRequest: { workspaceRoot: "/tmp/workspace" },
        returnUrl: "http://localhost/home",
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.launch}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.launch}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${SERVER_MODE_BOUNDARY_ROUTES.createWorkspaceLaunchIntent}`,
    );
  });

  it("routes tools call via backend origin without /api prefix", async () => {
    await post(ROOT_TRANSPORT_ROUTES.toolsCall, {
      tool: "list_mcp_tools",
      arguments: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}${ROOT_TRANSPORT_ROUTES.toolsCall}`,
    );
  });

  it("keeps binary upload on backend origin", async () => {
    await post(BINARY_TRANSPORT_ROUTES.upload, new FormData());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${BINARY_TRANSPORT_ROUTES.upload}`,
    );
  });
});
