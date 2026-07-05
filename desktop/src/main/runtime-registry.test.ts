import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { KnownRuntimeStore, type KnownRuntimeRecord } from "./known-runtime-store";
import { RuntimeRegistryController, type RuntimeRegistryHooks } from "./runtime-registry";

describe("RuntimeRegistryController", () => {
  test("stops request and stream lifecycle before switching and restarts after connect", async () => {
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const local = runtimeRecord({
      baseUrl: "http://127.0.0.1:41000/",
      deviceToken: "local_token",
      displayName: "Local runtime",
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceToken: "remote_token",
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: local.runtimeId, runtimes: [local, remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: runtimeFetch(),
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
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
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceToken: "remote_token",
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo("runtime_other", backendProtocolVersion));
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
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
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const local = runtimeRecord({
      baseUrl: "http://127.0.0.1:41000/",
      deviceToken: "local_token",
      displayName: "Local runtime",
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      deviceToken: "remote_token",
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [local, remote] });
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
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

  test("updates a stored generic remote name from the runtime-reported machine title", async () => {
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      displayName: "Setta Runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
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
      store,
    });

    await controller.load();
    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.runtimes).toHaveLength(1);
    expect(snapshot.runtimes[0]?.displayName).toBe("build-host-7");
    expect(snapshot.runtimes[0]?.infrastructureProvider.id).toBe("aws");
    expect(controller.currentRuntime()?.displayName).toBe("build-host-7");
  });

  test("uses the runtime hostname when an old remote reports the generic runtime name", async () => {
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const remote = runtimeRecord({
      baseUrl: "http://build-host-7.internal:7345/",
      displayName: "Setta Runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse({
            ...runtimeInfo(remote.runtimeId, backendProtocolVersion),
            displayName: "Setta Runtime",
            infrastructureProvider: runtimeInfrastructureProvider("unknown"),
          });
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks([]),
      onSnapshot: () => {},
      store,
    });

    await controller.load();
    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.runtimes[0]?.displayName).toBe("build-host-7");
    expect(controller.currentRuntime()?.displayName).toBe("build-host-7");
  });

  test("uses reverse DNS and provider hostnames for old IP-only remotes", async () => {
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const remote = runtimeRecord({
      baseUrl: "http://100.64.0.12:7345/",
      displayName: "Setta Runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: async (input) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse({
            ...runtimeInfo(remote.runtimeId, backendProtocolVersion),
            displayName: "Setta Runtime",
            infrastructureProvider: runtimeInfrastructureProvider("unknown"),
          });
        }
        return jsonResponse({ devices: [] });
      },
      hooks: lifecycleHooks([]),
      onSnapshot: () => {},
      resolveRuntimeHostName: async () => "gpu-worker-2.compute.amazonaws.com",
      store,
    });

    await controller.load();
    const snapshot = await controller.switchToRuntime(remote.runtimeId);

    expect(snapshot.runtimes[0]?.displayName).toBe("gpu-worker-2");
    expect(snapshot.runtimes[0]?.infrastructureProvider.id).toBe("aws");
    expect(controller.currentRuntime()?.displayName).toBe("gpu-worker-2");
  });

  test("creates phone pairing URLs through the active authenticated runtime", async () => {
    const store = new KnownRuntimeStore(await mkdtemp(join(tmpdir(), "setta-runtime-registry-")));
    const remote = runtimeRecord({
      baseUrl: "https://runtime.tailnet.ts.net/",
      deviceToken: "remote_token",
      displayName: "Remote runtime",
      runtimeId: "runtime_remote",
    });
    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote] });
    const createRequests: Array<{ authorization: string | null; body: unknown }> = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: async (input, init = {}) => {
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo(remote.runtimeId, backendProtocolVersion));
        }
        if (input.pathname === "/devices/list") {
          return jsonResponse({ devices: [] });
        }
        if (input.pathname === "/pairing/create-device") {
          createRequests.push({
            authorization: new Headers(init.headers).get("Authorization"),
            body: JSON.parse(String(init.body)),
          });
          return jsonResponse({
            expiresAt: "2026-07-07T10:10:00Z",
            pairingUrl: "https://runtime.tailnet.ts.net/#pair=token_phone",
          });
        }
        throw new Error(`unexpected request: ${input.pathname}`);
      },
      hooks: lifecycleHooks([]),
      onSnapshot: () => {},
      store,
    });

    await controller.load();
    await controller.switchToRuntime(remote.runtimeId);
    const pairing = await controller.createDevicePairing();

    expect(pairing).toEqual({
      expiresAt: "2026-07-07T10:10:00Z",
      pairingUrl: "https://runtime.tailnet.ts.net/#pair=token_phone",
    });
    expect(createRequests).toEqual([
      {
        authorization: "Bearer remote_token",
        body: { runtimeBaseUrl: "https://runtime.tailnet.ts.net/" },
      },
    ]);
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
    deviceToken: "token_test",
    displayName: "Runtime",
    isLocal: false,
    lastConnected: null,
    runtimeId: "runtime_test",
    ...overrides,
  };
}

function runtimeInfo(runtimeId: string, protocolVersion: number) {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: runtimeId === "runtime_local" ? "Local runtime" : "Remote runtime",
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "web_push"],
      version: 1,
    },
    infrastructureProvider:
      runtimeId === "runtime_remote"
        ? runtimeInfrastructureProvider("aws")
        : runtimeInfrastructureProvider("unknown"),
    protocolVersion,
    runtimeId,
    vapidPublicKey: "test-vapid-public-key",
  };
}

function runtimeInfrastructureProvider(id: "aws" | "unknown") {
  if (id === "aws") {
    return {
      displayName: "AWS",
      iconUrl: "https://aws.amazon.com/favicon.ico",
      id,
    };
  }
  return {
    displayName: "Unknown provider",
    iconUrl: "",
    id,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
