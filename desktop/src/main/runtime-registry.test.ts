import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { MemoryCredentialSecretStore } from "./credential-secret-store";
import { DesktopCredentialStore, type DesktopDeviceIdentity } from "./desktop-credential-store";
import type { LocalRuntimeEnrollment } from "./local-runtime-credential-client";
import type { ParsedPairingURL } from "./runtime-pairing";
import { KnownRuntimeStore, type KnownRuntimeRecord } from "./known-runtime-store";
import { RuntimeRegistryController, type RuntimeRegistryHooks } from "./runtime-registry";
import {
  RuntimeCredentialManager,
  type ControlPlaneRuntimeCredentialClient,
  type RefreshRuntimeCredentialRequest,
} from "./runtime-credential-manager";

describe("RuntimeRegistryController", () => {
  test("stops request and stream lifecycle before switching and restarts after connect", async () => {
    const store = await newRuntimeStore();
    const local = runtimeRecord({
      baseUrl: "http://127.0.0.1:41000/",
      deviceIdentity: deviceIdentity({ deviceId: "device_local", secret: "local_secret" }),
      displayName: "Local runtime",
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceIdentity: deviceIdentity({ deviceId: "device_remote", secret: "remote_secret" }),
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: local.runtimeId, runtimes: [local, remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      enrollRuntime,
      fetchImpl: runtimeFetch(),
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
      runtimeCredentials: newRuntimeCredentials(),
      store,
    });

    await controller.load();
    await controller.connectStoredOrLocal(local.runtimeId);
    events.length = 0;

    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.connection.status).toBe("connected");
    expect(controller.currentRuntime()).toMatchObject({
      baseUrl: remote.baseUrl,
      runtimeId: remote.runtimeId,
    });
    expect(events).toEqual([
      "snapshot:connecting",
      "offline:connecting",
      "before-switch",
      "online:runtime_remote",
      "snapshot:connected",
    ]);
  });

  test("blocks mismatched runtimes without starting streams", async () => {
    const store = await newRuntimeStore();
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceIdentity: deviceIdentity({ deviceId: "device_remote", secret: "remote_secret" }),
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      enrollRuntime,
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo("runtime_other", backendProtocolVersion));
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
      runtimeCredentials: newRuntimeCredentials(),
      store,
    });

    await controller.load();
    events.length = 0;
    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.connection.status).toBe("mismatched");
    expect(controller.currentRuntime()).toBeNull();
    expect(events).toEqual([
      "snapshot:connecting",
      "offline:connecting",
      "before-switch",
      "snapshot:mismatched",
      "failed:mismatched",
    ]);
  });

  test("falls back to local runtime when the stored remote is incompatible on startup", async () => {
    const store = await newRuntimeStore();
    const local = runtimeRecord({
      baseUrl: "http://127.0.0.1:41000/",
      deviceIdentity: deviceIdentity({ deviceId: "device_local", secret: "local_secret" }),
      displayName: "Local runtime",
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceIdentity: deviceIdentity({ deviceId: "device_remote", secret: "remote_secret" }),
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [local, remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      enrollRuntime,
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          const protocolVersion =
            input.host === "100.64.0.12:7345" ? backendProtocolVersion - 1 : backendProtocolVersion;
          return jsonResponse(runtimeInfo(runtimeIdForHost(input.host), protocolVersion));
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
      runtimeCredentials: newRuntimeCredentials(),
      store,
    });

    await controller.load();
    events.length = 0;
    const snapshot = await controller.connectStoredOrLocal(local.runtimeId);

    expect(snapshot.connection.status).toBe("connected");
    expect(controller.currentRuntime()).toMatchObject({
      baseUrl: local.baseUrl,
      runtimeId: local.runtimeId,
    });
    await expect(store.read()).resolves.toMatchObject({ activeRuntimeId: local.runtimeId });
    expect(events).toEqual([
      "snapshot:connecting",
      "offline:connecting",
      "snapshot:incompatible",
      "failed:incompatible",
      "snapshot:connecting",
      "offline:connecting",
      "online:runtime_local",
      "snapshot:connected",
    ]);
  });

  test("updates a stored remote name from current runtime metadata", async () => {
    const store = await newRuntimeStore();
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      enrollRuntime,
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse({
            ...runtimeInfo(remote.runtimeId, backendProtocolVersion),
            displayName: "build-host-7",
          });
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks([]),
      onSnapshot: () => {},
      runtimeCredentials: newRuntimeCredentials(),
      store,
    });

    await controller.load();
    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.runtimes).toHaveLength(1);
    expect(snapshot.runtimes[0]?.displayName).toBe("build-host-7");
    expect(controller.currentRuntime()?.displayName).toBe("build-host-7");
  });

  test("returns current runtime credential without exposing the device secret", async () => {
    const store = await newRuntimeStore();
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceIdentity: deviceIdentity({ deviceId: "device_remote", secret: "remote_secret" }),
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const controlPlane = new FakeControlPlaneRuntimeCredentialClient();
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      enrollRuntime,
      fetchImpl: runtimeFetch(),
      hooks: lifecycleHooks([]),
      onSnapshot: () => {},
      runtimeCredentials: newRuntimeCredentials(controlPlane),
      store,
    });

    await controller.load();
    await controller.switchToRuntime(remote.runtimeId);
    const credential = await controller.currentRuntimeCredential();

    expect(credential).toMatchObject({
      deviceId: "device_remote",
      runtimeId: "runtime_remote",
      token: "credential:runtime_remote:device_remote",
    });
    expect(JSON.stringify(credential)).not.toContain("remote_secret");
    expect(controlPlane.requests[0]?.deviceIdentity.secret).toBe("remote_secret");
  });
});

function lifecycleHooks(events: string[]): RuntimeRegistryHooks {
  return {
    activeRuntimeFailed: (state) => {
      events.push(`failed:${state.status}`);
    },
    activeRuntimeOffline: (state) => {
      events.push(`offline:${state.status}`);
    },
    activeRuntimeOnline: (runtime) => {
      events.push(`online:${runtime.runtimeId}`);
    },
    beforeRuntimeSwitch: async () => {
      events.push("before-switch");
    },
  };
}

async function newRuntimeStore(): Promise<KnownRuntimeStore> {
  return new KnownRuntimeStore(
    await mkdtemp(join(tmpdir(), "setta-runtime-registry-")),
    new DesktopCredentialStore(new MemoryCredentialSecretStore()),
  );
}

function newRuntimeCredentials(
  controlPlane: ControlPlaneRuntimeCredentialClient = new FakeControlPlaneRuntimeCredentialClient(),
): RuntimeCredentialManager {
  return new RuntimeCredentialManager(
    new DesktopCredentialStore(new MemoryCredentialSecretStore()),
    controlPlane,
    {
      clock: () => new Date("2026-07-16T12:00:00.000Z"),
      refreshSkewMs: 0,
    },
  );
}

class FakeControlPlaneRuntimeCredentialClient implements ControlPlaneRuntimeCredentialClient {
  readonly requests: RefreshRuntimeCredentialRequest[] = [];

  async refreshRuntimeCredential(request: RefreshRuntimeCredentialRequest): Promise<{
    deviceId: string;
    expiresAt: string;
    runtimeId: string;
    token: string;
  }> {
    this.requests.push(request);
    return {
      deviceId: request.deviceIdentity.deviceId,
      expiresAt: "2026-07-16T12:05:00.000Z",
      runtimeId: request.runtimeId,
      token: `credential:${request.runtimeId}:${request.deviceIdentity.deviceId}`,
    };
  }
}

async function enrollRuntime(pairing: ParsedPairingURL): Promise<LocalRuntimeEnrollment> {
  const identity = deviceIdentity({ deviceId: `device_${pairing.runtimeId}` });
  return {
    deviceIdentity: identity,
    protocolVersion: backendProtocolVersion,
    runtimeCredential: {
      deviceId: identity.deviceId,
      expiresAt: "2026-07-16T12:05:00.000Z",
      runtimeId: pairing.runtimeId,
      token: `credential:${pairing.runtimeId}:${identity.deviceId}`,
    },
    runtimeId: pairing.runtimeId,
  };
}

function runtimeFetch(): BackendFetch {
  return async (input, init) => {
    if (input.pathname === "/runtime/info") {
      return jsonResponse(runtimeInfo(runtimeIdForHost(input.host), backendProtocolVersion));
    }
    expect(init.headers).toBeInstanceOf(Headers);
    return jsonResponse({ devices: [] });
  };
}

function runtimeIdForHost(host: string): string {
  if (host === "127.0.0.1:41000") {
    return "runtime_local";
  }
  if (host === "100.64.0.12:7345") {
    return "runtime_remote";
  }
  throw new Error(`unexpected host: ${host}`);
}

function runtimeRecord(overrides: Partial<KnownRuntimeRecord>): KnownRuntimeRecord {
  return {
    baseUrl: "http://127.0.0.1:41000/",
    deviceIdentity: deviceIdentity(),
    displayName: "Runtime",
    isLocal: false,
    lastConnected: null,
    protocolVersion: backendProtocolVersion,
    runtimeId: "runtime_test",
    ...overrides,
  };
}

function deviceIdentity(overrides: Partial<DesktopDeviceIdentity> = {}): DesktopDeviceIdentity {
  return {
    deviceId: "device_test",
    secret: "device_secret",
    userId: "user_test",
    ...overrides,
  };
}

function runtimeInfo(runtimeId: string, protocolVersion: number) {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: runtimeId === "runtime_local" ? "Local runtime" : "Remote runtime",
    protocolVersion,
    runtimeId,
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "setup_attestation", "web_push"],
      version: 1,
    },
    diagnostics: runtimeDiagnostics(),
  };
}

function runtimeDiagnostics() {
  return {
    settaRelease: {
      status: "unavailable",
      runtimeVersion: "test",
      metadataPresent: false,
      metadataValid: false,
      installedVersion: "",
      reasonCode: "test",
    },
    codex: {
      status: "unavailable",
      binary: { status: "unavailable", command: "codex", present: false, reasonCode: "test" },
      authentication: {
        status: "unavailable",
        accountStatus: "",
        accountType: "",
        requiresOpenaiAuth: false,
        loginStatus: "",
        reasonCode: "test",
      },
    },
    workloadLease: {
      status: "unavailable",
      configured: false,
      leaseName: "setta-agent",
      active: false,
      startedAt: "",
      expiresAt: "",
      reasonCode: "test",
    },
    policy: {
      status: "unavailable",
      configured: false,
      present: false,
      schemaVersion: 0,
      ruleCount: 0,
      reasonCode: "test",
    },
    diskSpace: {
      status: "unavailable",
      availableMib: 0,
      totalMib: 0,
      minimumFreeMib: 0,
      reasonCode: "test",
    },
    protectedState: {
      status: "unavailable",
      present: false,
      directory: false,
      ownerOnlyWritable: false,
      reasonCode: "test",
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
