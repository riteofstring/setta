import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { C_ADDRESSES } from "@setta/app-subsystem-frontend-sdk";
import { useServerMode } from "state/definitions";
import { TransportRouteConstants } from "./generatedTypes";
import { post } from "./requestTransport";

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
    await post(TransportRouteConstants.status.revealPathInOsFileExplorer, {
      path: "/tmp/example",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.status.revealPathInOsFileExplorer}`,
    );
  });

  it("routes launcher repair/update/remove via backend origin", async () => {
    await post(TransportRouteConstants.launcherManagement.repairLauncher, {});
    await post(TransportRouteConstants.launcherManagement.updateLauncher, {
      packageSpec: "setta",
    });
    await post(TransportRouteConstants.launcherManagement.removeLauncher, {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.launcherManagement.repairLauncher}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.launcherManagement.updateLauncher}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.launcherManagement.removeLauncher}`,
    );
  });

  it("routes launcher-home APIs via launcher origin", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(
      TransportRouteConstants.serverModeBoundary.listLauncherDirectory,
      {
        path: null,
      },
    );
    await post(
      TransportRouteConstants.serverModeBoundary.openLauncherWorkspace,
      {
        workspaceRoot: "/tmp/example",
        createIfMissing: false,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${TransportRouteConstants.serverModeBoundary.listLauncherDirectory}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${TransportRouteConstants.serverModeBoundary.openLauncherWorkspace}`,
    );
  });

  it("routes launch endpoint via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(TransportRouteConstants.serverModeBoundary.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.launch}`,
    );
  });

  it("routes launch endpoint via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(TransportRouteConstants.serverModeBoundary.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${TransportRouteConstants.serverModeBoundary.launch}`,
    );
  });

  it("routes launch endpoint via backend origin while mode is unresolved", async () => {
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    await post(TransportRouteConstants.serverModeBoundary.launch, {
      workspaceRoot: "/tmp/workspace",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.launch}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(
      TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent,
      {
        launchRequest: { workspaceRoot: "/tmp/workspace" },
        returnUrl: "http://localhost/home",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(
      TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent,
      {
        launchRequest: { workspaceRoot: "/tmp/workspace" },
        returnUrl: "http://localhost/home",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent}`,
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
      await post(TransportRouteConstants.serverModeBoundary.launch, {
        launchIntentToken: "intent-token",
      });
      await post(
        TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent,
        {
          launchRequest: { workspaceRoot: "/tmp/workspace" },
          returnUrl: "http://localhost/home",
        },
      );
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.launch}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.launch}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.serverModeBoundary.createWorkspaceLaunchIntent}`,
    );
  });

  it("routes tools call via backend origin without /api prefix", async () => {
    await post(TransportRouteConstants.root.toolsCall, {
      tool: "list_mcp_tools",
      arguments: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}${TransportRouteConstants.root.toolsCall}`,
    );
  });

  it("keeps binary upload on backend origin", async () => {
    await post(TransportRouteConstants.binary.upload, new FormData());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${TransportRouteConstants.binary.upload}`,
    );
  });
});
