import { ipcChannels, ipcEvents } from "@shared/ipc";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

async function exposePreloadAPI({
  invoke = vi.fn(),
  on = vi.fn(),
  removeListener = vi.fn(),
  send = vi.fn(),
} = {}) {
  const exposed: Record<string, unknown> = {};
  vi.doMock("electron", () => ({
    contextBridge: {
      exposeInMainWorld: (name: string, api: unknown) => {
        exposed[name] = api;
      },
    },
    ipcRenderer: {
      invoke,
      on,
      removeListener,
      send,
    },
  }));

  await import("./index");

  return { api: exposed.setta as SettaAPI, invoke, on, removeListener };
}

describe("preload runtime API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_DEBUG", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT", "");
  });

  test("exposes typed runtime methods through IPC", async () => {
    const { api, invoke, on, removeListener } = await exposePreloadAPI();
    expect(Object.keys(api.runtimes).sort()).toEqual([
      "addByPairingUrl",
      "addExistingMachineOverSSH",
      "createDevicePairing",
      "current",
      "list",
      "onConnectionState",
      "remove",
      "switch",
      "tailscaleAuthKeyMint",
      "tailscaleOAuthSaveCredentials",
      "tailscaleOAuthSetupGuide",
      "tailscaleOAuthValidate",
    ]);

    await api.runtimes.current();
    await api.runtimes.list();
    await api.runtimes.addExistingMachineOverSSH({
      installerSha256: "a".repeat(64),
      minisignPublicKey: "RWQtestminisignpublickey",
      releaseBaseUrl: "https://downloads.example.test/setta/v1.2.3",
      settaVersion: "v1.2.3",
      sshTarget: "ssh://ubuntu@example.com",
      tailscaleAuthKey: "tskey-auth-secret",
    });
    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_remote&tok=tok&url=http://host");
    await api.runtimes.createDevicePairing();
    await api.runtimes.switch("runtime_remote");
    await api.runtimes.remove("runtime_remote");
    await api.runtimes.tailscaleOAuthSetupGuide?.();
    await api.runtimes.tailscaleOAuthSaveCredentials?.({
      clientId: "oauth-client",
      clientSecret: "oauth-secret",
    });
    await api.runtimes.tailscaleOAuthValidate?.();
    await api.runtimes.tailscaleAuthKeyMint?.({ runtimeName: "setta-worker" });
    const listener = vi.fn();
    const unsubscribe = api.runtimes.onConnectionState(listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.runtimeConnectionState)?.[1];
    if (typeof handler !== "function") {
      throw new Error("runtime connection-state handler was not registered");
    }
    const snapshot = runtimeSnapshot();
    handler({}, snapshot);
    unsubscribe();

    expect(invoke.mock.calls).toEqual([
      [ipcChannels.runtimeCurrent],
      [ipcChannels.runtimeList],
      [
        ipcChannels.runtimeAddExistingMachineOverSSH,
        {
          installerSha256: "a".repeat(64),
          minisignPublicKey: "RWQtestminisignpublickey",
          releaseBaseUrl: "https://downloads.example.test/setta/v1.2.3",
          settaVersion: "v1.2.3",
          sshTarget: "ssh://ubuntu@example.com",
          tailscaleAuthKey: "tskey-auth-secret",
        },
      ],
      [
        ipcChannels.runtimeAddByPairingUrl,
        "setta://pair?rt=runtime_remote&tok=tok&url=http://host",
      ],
      [ipcChannels.runtimeCreateDevicePairing],
      [ipcChannels.runtimeSwitch, "runtime_remote"],
      [ipcChannels.runtimeRemove, "runtime_remote"],
      [ipcChannels.runtimeTailscaleOAuthSetupGuide],
      [
        ipcChannels.runtimeTailscaleOAuthSaveCredentials,
        {
          clientId: "oauth-client",
          clientSecret: "oauth-secret",
        },
      ],
      [ipcChannels.runtimeTailscaleOAuthValidate],
      [ipcChannels.runtimeTailscaleAuthKeyMint, { runtimeName: "setta-worker" }],
    ]);
    expect(on).toHaveBeenCalledWith(ipcEvents.runtimeConnectionState, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(snapshot);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.runtimeConnectionState, handler);
  });
});

function runtimeSnapshot() {
  return {
    activeRuntimeId: "runtime_remote",
    connection: {
      message: "Connected to Remote",
      protocolVersion: 1,
      runtimeId: "runtime_remote",
      status: "connected",
      updatedAt: "2026-07-02T12:00:00Z",
    },
    runtimes: [
      {
        active: true,
        baseUrl: "http://100.64.0.12:7345/",
        connectionMessage: "Connected to Remote",
        connectionStatus: "connected",
        displayName: "Remote",
        infrastructureProvider: {
          displayName: "Unknown provider",
          iconUrl: "",
          id: "unknown",
        },
        isLocal: false,
        lastConnected: "2026-07-02T12:00:00Z",
        runtimeId: "runtime_remote",
      },
    ],
    switching: false,
  };
}
