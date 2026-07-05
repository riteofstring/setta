import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { KnownRuntimeStore, type KnownRuntimeRecord } from "./known-runtime-store";
import type { PendingProvisionRecord } from "./pending-provision-store";
import { ProvisionCreationResourceStore } from "./provision-creation-resource-store";
import { RuntimeRegistryController, type RuntimeRegistryHooks } from "./runtime-registry";
import { MemoryRuntimeSecretStore } from "./runtime-secret-store";
import type { TailnetNode } from "./provision-watch";

describe("RuntimeRegistryController", () => {
  test("stops request and stream lifecycle before switching and restarts after connect", async () => {
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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
    const store = await newRuntimeStore();
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

  test("registers a provisioned runtime after verified tailnet watch pairing", async () => {
    const secrets = new MemoryRuntimeSecretStore();
    const store = new KnownRuntimeStore(
      await mkdtemp(join(tmpdir(), "setta-runtime-registry-")),
      secrets,
    );
    const pending = pendingProvision();
    const node = tailnetNode();
    const calls: Array<{ authorization: string | null; body: unknown; path: string }> = [];
    const events: string[] = [];
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: provisionedRuntimeFetch({ calls, pending }),
      hooks: lifecycleHooks(events),
      onSnapshot: (snapshot) => events.push(`snapshot:${snapshot.connection.status}`),
      store,
    });

    await controller.load();
    events.length = 0;
    const snapshot = await controller.watchProvisionAndPair({
      nonce: () => "nonce-000000000000000000000000",
      now: () => new Date("2026-07-07T10:00:00.000Z"),
      pending,
      tailnetClient: { listNodes: async () => [node] },
    });

    expect(snapshot.connection.status).toBe("connected");
    expect(snapshot.activeRuntimeId).toBe("runtime_remote");
    expect(controller.currentRuntime()).toMatchObject({
      baseUrl: "http://setta-worker.tailnet.ts.net:7345/",
      deviceToken: "device_token",
      runtimeId: "runtime_remote",
    });
    await expect(store.read()).resolves.toMatchObject({
      activeRuntimeId: "runtime_remote",
      runtimes: [
        {
          baseUrl: "http://setta-worker.tailnet.ts.net:7345/",
          deviceToken: "device_token",
          runtimeId: "runtime_remote",
        },
      ],
    });
    await expect(secrets.getSecret("runtime-device-token:v1:runtime_remote")).resolves.toBe(
      "device_token",
    );
    expect(calls.map((call) => call.path)).toEqual([
      "/runtime/info",
      "/setup/attestation",
      "/pairing/complete",
      "/runtime/info",
      "/devices/list",
    ]);
    expect(calls[2]?.body).toMatchObject({
      clientDisplayName: "Setta Desktop",
      pairingToken: pending.pairingToken,
    });
    expect(calls[4]?.authorization).toBe("Bearer device_token");
    expect(events).toEqual([
      "snapshot:connecting",
      "offline:connecting",
      "before-switch",
      "online:runtime_remote",
      "snapshot:connected",
    ]);
  });

  test("projects local provision creation records into runtime snapshots", async () => {
    const store = await newRuntimeStore();
    const appDataDir = await mkdtemp(join(tmpdir(), "setta-provision-creations-"));
    await writeProvisionCreations(appDataDir, [
      provisionCreationRecord({
        createdAt: "2026-07-05T10:00:00.000Z",
        expectedResourceName: "setta-worker",
        provider: "hetzner",
        recordId: "hetzner:setta-worker",
        region: "fsn1",
        resourceId: "12345",
        runtimeName: "setta-worker",
        status: "succeeded",
        teardownReady: true,
      }),
      provisionCreationRecord({
        expectedResourceName: "deleted-worker",
        provider: "hetzner",
        recordId: "hetzner:deleted-worker",
        runtimeName: "deleted-worker",
        status: "deleted",
      }),
    ]);
    const controller = new RuntimeRegistryController({
      clientDisplayName: () => "Setta Desktop",
      fetchImpl: runtimeFetch(),
      hooks: lifecycleHooks([]),
      now: () => new Date("2026-07-07T12:00:00.000Z"),
      onSnapshot: () => {},
      provisionResources: new ProvisionCreationResourceStore(appDataDir),
      store,
    });

    const snapshot = await controller.load();

    expect(snapshot.cloudResources).toHaveLength(1);
    expect(snapshot.cloudResources[0]).toMatchObject({
      billingWarning:
        "Created via Setta on 2026-07-05; this desktop has not reached the runtime for 2 days and it may still be billing.",
      cleanupSummary: "Stored teardown is ready; review the plan before deleting this resource.",
      expectedResourceName: "setta-worker",
      infrastructureProvider: {
        displayName: "Hetzner",
        id: "hetzner",
      },
      lastReachableAt: null,
      recordId: "hetzner:setta-worker",
      region: "fsn1",
      resourceId: "12345",
      runtimeName: "setta-worker",
      status: "succeeded",
      teardownReady: true,
    });
    expect(snapshot.cloudResources[0]?.commands.diagnose).toContain(
      "setta provision diagnose --json",
    );
    expect(snapshot.cloudResources[0]?.commands.teardownApprove).toContain(
      "setta provision down --json --approve",
    );
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
    new MemoryRuntimeSecretStore(),
  );
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

async function writeProvisionCreations(appDataDir: string, creations: unknown[]): Promise<void> {
  await mkdir(appDataDir, { recursive: true });
  await writeFile(
    join(appDataDir, "provision-creations.json"),
    JSON.stringify({ creations, schemaVersion: 1 }, null, 2) + "\n",
    "utf8",
  );
}

function provisionCreationRecord(
  overrides: Partial<{
    createdAt: string;
    expectedResourceName: string;
    lastError: string;
    provider: string;
    recordId: string;
    region: string;
    resourceId: string;
    runtimeName: string;
    status: string;
    teardownReady: boolean;
    updatedAt: string;
  }>,
) {
  const record = {
    createdAt: "2026-07-07T10:00:00.000Z",
    expectedResourceName: "setta-worker",
    provider: "hetzner",
    recordId: "hetzner:setta-worker",
    region: "fsn1",
    runtimeName: "setta-worker",
    status: "succeeded",
    teardownAction: {
      ready: true,
    },
    updatedAt: "2026-07-07T10:05:00.000Z",
    ...overrides,
  };
  return {
    ...record,
    teardownAction: {
      ready: overrides.teardownReady ?? record.teardownAction.ready,
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function provisionedRuntimeFetch(options: {
  calls: Array<{ authorization: string | null; body: unknown; path: string }>;
  pending: PendingProvisionRecord;
}): BackendFetch {
  return async (input, init = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    options.calls.push({
      authorization: new Headers(init.headers).get("Authorization"),
      body,
      path: input.pathname,
    });
    if (input.pathname === "/runtime/info") {
      return jsonResponse(runtimeInfo("runtime_remote", backendProtocolVersion));
    }
    if (input.pathname === "/setup/attestation") {
      return jsonResponse({
        algorithm: "hmac-sha256-v1",
        attestation: setupAttestation({
          attestationKey: options.pending.attestationKey,
          nodeFingerprint: body.nodeFingerprint,
          nonce: body.nonce,
          provisionId: options.pending.provisionId,
          runtimeId: "runtime_remote",
        }),
        expiresAt: "2026-07-07T11:00:00.000Z",
        nodeFingerprint: body.nodeFingerprint,
        nonce: body.nonce,
        provisionId: options.pending.provisionId,
        runtimeId: "runtime_remote",
      });
    }
    if (input.pathname === "/pairing/complete") {
      return jsonResponse({
        deviceId: "device_desktop",
        deviceToken: "device_token",
        protocolVersion: backendProtocolVersion,
        runtimeId: "runtime_remote",
      });
    }
    if (input.pathname === "/devices/list") {
      return jsonResponse({ devices: [] });
    }
    throw new Error(`unexpected request: ${input.pathname}`);
  };
}

function setupAttestation(options: {
  attestationKey: string;
  nodeFingerprint: string;
  nonce: string;
  provisionId: string;
  runtimeId: string;
}): string {
  const hmac = createHmac("sha256", options.attestationKey);
  for (const field of [
    "setta-setup-attestation-v1",
    options.runtimeId,
    options.provisionId,
    options.nonce,
    options.nodeFingerprint,
  ]) {
    hmac.update(field);
    hmac.update("\0");
  }
  return hmac.digest("hex");
}

function pendingProvision(): PendingProvisionRecord {
  return {
    attestationKey: "attestation-key-000000000000000000000000",
    createdAt: "2026-07-07T10:00:00.000Z",
    expectedTag: "tag:setta-runtime",
    expiresAt: "2026-07-07T11:00:00.000Z",
    pairingToken: "pairing-token-000000000000000000000000",
    provisionId: "provision_test",
    runtimeName: "setta-worker",
    runtimePort: 7345,
    scheme: "http",
  };
}

function tailnetNode(): TailnetNode {
  return {
    dnsName: "setta-worker.tailnet.ts.net.",
    hostName: "setta-worker",
    id: "node-123",
    online: true,
    publicKey: "node-public-key",
    tags: ["tag:setta-runtime"],
    tailscaleIPs: ["100.64.0.12"],
  };
}
