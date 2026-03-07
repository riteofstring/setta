import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServerMode } from "state/definitions";
import { C_ADDRESSES } from "./c_addresses";
import {
  ENDPOINT_ORIGIN_POLICY,
  get,
  getBinary,
  getErrorCode,
  getErrorDetail,
  post,
  resolveEndpointOrigin,
} from "./endpointUtils";
import { RouteEnum } from "./generatedTypes";

describe("endpointUtils URL routing", () => {
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

  it("routes settaHomeInfo via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await get(RouteEnum.GET_SETTA_HOME_INFO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.GET_SETTA_HOME_INFO}`,
    );
  });

  it("keeps settaHomeInfo on backend origin when launcher/backend differ in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );

    await get(RouteEnum.GET_SETTA_HOME_INFO);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/settaHomeInfo",
    );
  });

  it("routes revealPathInOsFileExplorer via backend origin", async () => {
    await post(RouteEnum.REVEAL_PATH_IN_OS_FILE_EXPLORER, {
      path: "/tmp/example",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.REVEAL_PATH_IN_OS_FILE_EXPLORER}`,
    );
  });

  it("routes launcherStatus via backend origin", async () => {
    await get(RouteEnum.GET_LAUNCHER_STATUS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.GET_LAUNCHER_STATUS}`,
    );
  });

  it("routes launcher repair/update/remove via backend origin", async () => {
    await post(RouteEnum.REPAIR_LAUNCHER, {});
    await post(RouteEnum.UPDATE_LAUNCHER, { packageSpec: "setta" });
    await post(RouteEnum.REMOVE_LAUNCHER, {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.REPAIR_LAUNCHER}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.UPDATE_LAUNCHER}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.REMOVE_LAUNCHER}`,
    );
  });

  it("routes launcher-home APIs via launcher origin", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await get(RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES);
    await get(RouteEnum.GET_LAUNCHER_FILESYSTEM_ROOTS);
    await post(RouteEnum.LIST_LAUNCHER_DIRECTORY, { path: null });
    await post(RouteEnum.OPEN_LAUNCHER_WORKSPACE, {
      workspaceRoot: "/tmp/example",
      createIfMissing: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_LAUNCHER_FILESYSTEM_ROOTS}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.LIST_LAUNCHER_DIRECTORY}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.OPEN_LAUNCHER_WORKSPACE}`,
    );
  });

  it("routes settaHomeInfo via backend origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });

    await get(RouteEnum.GET_SETTA_HOME_INFO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.GET_SETTA_HOME_INFO}`,
    );
  });

  it("keeps a single endpoint-origin policy contract", () => {
    // Contract test: launcher mode routes always resolve to launcher origin.
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    for (const [route, origin] of Object.entries(ENDPOINT_ORIGIN_POLICY)) {
      if (origin === "launcher") {
        expect(resolveEndpointOrigin(route)).toBe("launcher");
      }
    }
    expect(resolveEndpointOrigin(RouteEnum.GET_LAUNCHER_STATUS)).toBe(
      "backend",
    );
  });

  it("routes launch endpoint via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(RouteEnum.LAUNCH, { workspaceRoot: "/tmp/workspace" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.LAUNCH}`,
    );
  });

  it("routes launch endpoint via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(RouteEnum.LAUNCH, { workspaceRoot: "/tmp/workspace" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.LAUNCH}`,
    );
  });

  it("routes launch endpoint via backend origin while mode is unresolved", async () => {
    useServerMode.setState({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    await post(RouteEnum.LAUNCH, { workspaceRoot: "/tmp/workspace" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.LAUNCH}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via backend origin in ide mode", async () => {
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
    await post(RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT, {
      launchRequest: { workspaceRoot: "/tmp/workspace" },
      returnUrl: "http://localhost/home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT}`,
    );
  });

  it("routes createWorkspaceLaunchIntent via launcher origin in launcher mode", async () => {
    useServerMode.setState({
      mode: "launcher",
      modeResolved: true,
      modeError: null,
    });
    await post(RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT, {
      launchRequest: { workspaceRoot: "/tmp/workspace" },
      returnUrl: "http://localhost/home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT}`,
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
      await post(RouteEnum.LAUNCH, {
        launchIntentToken: "intent-token",
      });
      await post(RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT, {
        launchRequest: { workspaceRoot: "/tmp/workspace" },
        returnUrl: "http://localhost/home",
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.LAUNCH}`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT}`,
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.LAUNCH}`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.CREATE_WORKSPACE_LAUNCH_INTENT}`,
    );
  });

  it("serializes launcher recent-workspaces query params", async () => {
    // The launcher recent-workspaces endpoint accepts `setta_home` as a query param.
    await get(RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES, {
      setta_home: "/tmp/setta-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES}?setta_home=%2Ftmp%2Fsetta-home`,
    );
  });

  it("keeps backend routing for query-bearing launcher status route", async () => {
    vi.spyOn(C_ADDRESSES, "BACKEND", "get").mockReturnValue(
      "http://backend.example/api",
    );
    vi.spyOn(C_ADDRESSES, "LAUNCHER", "get").mockReturnValue(
      "http://launcher.example/api",
    );
    vi.spyOn(C_ADDRESSES, "BACKEND_ORIGIN", "get").mockReturnValue(
      "http://backend-origin.example",
    );

    await get(RouteEnum.GET_LAUNCHER_STATUS, {
      setta_home: "/tmp/scoped-home",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://backend.example/api/launcherStatus?setta_home=%2Ftmp%2Fscoped-home",
    );
  });

  it("omits null query params during URL construction", async () => {
    await get(RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES, {
      setta_home: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.LAUNCHER}${RouteEnum.GET_LAUNCHER_RECENT_WORKSPACES}`,
    );
  });

  it("routes tools call via backend origin without /api prefix", async () => {
    await post(RouteEnum.TOOLS_CALL, {
      tool: "list_mcp_tools",
      arguments: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND_ORIGIN}${RouteEnum.TOOLS_CALL}`,
    );
  });

  it("keeps streamAppSpec on backend origin", async () => {
    await post(RouteEnum.STREAM_APP_SPEC, { prompt: "Generate app" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}${RouteEnum.STREAM_APP_SPEC}`,
    );
  });

  it("parses binary responses as Uint8Array", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "text/csv" },
      }),
    );

    const result = await getBinary(RouteEnum.BINARY_DOWNLOAD, {
      contentId: "abc123",
    });

    expect(result.status).toBe(200);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.data ?? [])).toEqual([1, 2, 3]);
  });

  it("parses non-2xx binary responses as JSON error payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Missing content id." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await getBinary(RouteEnum.BINARY_DOWNLOAD, {
      contentId: "missing",
    });

    expect(result.status).toBe(404);
    expect(getErrorDetail(result.data)).toBe("Missing content id.");
  });

  it("extracts detail from raw binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({ detail: "Permission denied." }),
    );

    expect(getErrorDetail(binaryJson)).toBe("Permission denied.");
  });

  it("extracts nested detail and error code payloads", () => {
    const payload = {
      detail: {
        message:
          "Realtime transcription is unavailable for this provider/model.",
        errorCode: "unsupported_model",
      },
    };

    expect(getErrorDetail(payload)).toBe(
      "Realtime transcription is unavailable for this provider/model.",
    );
    expect(getErrorCode(payload)).toBe("unsupported_model");
  });

  it("extracts error codes from binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({
        detail: {
          message: "Missing API key.",
          errorCode: "missing_api_key",
        },
      }),
    );

    expect(getErrorCode(binaryJson)).toBe("missing_api_key");
  });

  it("extracts Go-style error envelopes", () => {
    const payload = {
      error: {
        code: "unknown_share_session",
        message: "Share session not found: share-a",
      },
    };

    expect(getErrorDetail(payload)).toBe("Share session not found: share-a");
    expect(getErrorCode(payload)).toBe("unknown_share_session");
  });

  it("extracts Go-style error envelopes from binary JSON payloads", () => {
    const binaryJson = new TextEncoder().encode(
      JSON.stringify({
        error: {
          code: "project_config_not_found",
          message: "Project config not found.",
        },
      }),
    );

    expect(getErrorDetail(binaryJson)).toBe("Project config not found.");
    expect(getErrorCode(binaryJson)).toBe("project_config_not_found");
  });
});
