import type { DeveloperHostedRuntimeStatus } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  DeveloperHostedRuntimeController,
  hostedTestWorkspacePath,
  type DeveloperHostedRuntimeClient,
} from "./developer-hosted-runtime-controller";

describe("DeveloperHostedRuntimeController", () => {
  test("recovers a connecting operation without exposing bootstrap credentials", async () => {
    const connecting = hostedStatus({ phase: "connecting" });
    const connected = hostedStatus({
      phase: "connected",
      terminalOutcome: "connected",
      lastConnectedAt: "2026-07-27T14:03:00Z",
    });
    const sent: DeveloperHostedRuntimeStatus[] = [];
    const registrations: unknown[] = [];
    const opened: string[] = [];
    const client = fakeClient({
      readStatus: async () => connecting,
      confirmConnected: async () => connected,
    });
    const controller = new DeveloperHostedRuntimeController({
      client,
      enabled: true,
      openHostedTestWorkspace: async (path) => {
        opened.push(path);
      },
      runtimeRegistry: () => ({
        list: () => [],
        registerManagedHostedRuntime: async (input) => {
          registrations.push(input);
          return {
            activeRuntimeId: "runtime-hosted",
            connection: {
              message: "Connected",
              protocolVersion: 1,
              runtimeId: "runtime-hosted",
              status: "connected",
              updatedAt: "2026-07-27T14:03:00Z",
            },
            runtimes: [],
            switching: false,
          };
        },
        removeManagedHostedRuntime: async () => {
          throw new Error("unexpected removal");
        },
      }),
      senders: () => [
        {
          isDestroyed: () => false,
          send: (_channel, status) => sent.push(status),
        },
      ],
      socketPath: () => "/tmp/developer-hosted-test.sock",
    });

    await expect(controller.load()).resolves.toEqual(connected);

    expect(registrations).toEqual([
      expect.objectContaining({
        runtimeId: "runtime-hosted",
        token: "private-bootstrap-token",
      }),
    ]);
    expect(opened).toEqual([hostedTestWorkspacePath]);
    expect(sent.map((status) => status.phase)).toEqual(["connecting", "connected"]);
    expect(JSON.stringify(sent)).not.toContain("private-bootstrap-token");
    expect(JSON.stringify(sent)).not.toContain("private-device-secret");
  });

  test("removes local managed credentials only after verified provider removal", async () => {
    const removed = hostedStatus({
      operationId: "destroy-hosted",
      operationKind: "destroy",
      phase: "removed",
      terminalOutcome: "removed",
    });
    const actions: string[] = [];
    const controller = new DeveloperHostedRuntimeController({
      client: fakeClient({
        readStatus: async () => removed,
        finalizeRemoval: async () => {
          actions.push("finalize");
        },
      }),
      enabled: true,
      openHostedTestWorkspace: async () => {},
      runtimeRegistry: () => ({
        list: () => [
          {
            baseUrl: "https://runtime.test.invalid/",
            displayName: "Hosted developer runtime",
            isLocal: false,
            lastConnected: null,
            managedHosted: true,
            runtimeId: "runtime-hosted",
            active: true,
            connectionMessage: "Connected",
            connectionStatus: "connected",
          },
        ],
        registerManagedHostedRuntime: async () => {
          throw new Error("unexpected registration");
        },
        removeManagedHostedRuntime: async (runtimeId) => {
          actions.push(`remove:${runtimeId}`);
          return {
            activeRuntimeId: null,
            connection: {
              message: "No runtime connected",
              protocolVersion: null,
              runtimeId: null,
              status: "disconnected",
              updatedAt: "2026-07-27T14:03:00Z",
            },
            runtimes: [],
            switching: false,
          };
        },
      }),
      senders: () => [],
      socketPath: () => "/tmp/developer-hosted-test.sock",
    });

    await expect(controller.load()).resolves.toEqual(removed);
    expect(actions).toEqual(["remove:runtime-hosted", "finalize"]);
  });

  test("uses the durable expiry time for a one-shot status refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T14:00:00Z"));
    try {
      const connected = hostedStatus({
        phase: "connected",
        terminalOutcome: "connected",
        deletionScheduledAt: "2026-07-27T14:00:01Z",
      });
      const destroying = hostedStatus({
        operationId: "automatic-destroy",
        operationKind: "destroy",
        phase: "destroying",
        terminalOutcome: null,
      });
      let reads = 0;
      const streams: string[] = [];
      const client = fakeClient({
        readStatus: async () => {
          reads++;
          return reads === 1 ? connected : destroying;
        },
        streamStatus: async function* (_socket, operationId) {
          streams.push(operationId);
          if (operationId === "") {
            yield destroying;
          }
        },
      });
      const controller = new DeveloperHostedRuntimeController({
        client,
        enabled: true,
        openHostedTestWorkspace: async () => {},
        runtimeRegistry: () => ({
          list: () => [],
          registerManagedHostedRuntime: async () => {
            throw new Error("unexpected registration");
          },
          removeManagedHostedRuntime: async () => {
            throw new Error("unexpected removal");
          },
        }),
        senders: () => [],
        socketPath: () => "/tmp/developer-hosted-test.sock",
      });

      await controller.load();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(reads).toBe(2);
      expect(controller.status()).toEqual(destroying);
      expect(streams).toEqual(["automatic-destroy"]);
      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

function hostedStatus(
  overrides: Partial<DeveloperHostedRuntimeStatus> = {},
): DeveloperHostedRuntimeStatus {
  return {
    operationId: "ensure-hosted",
    cursor: "5",
    runtimeRegistryId: "runtime-hosted",
    operationKind: "ensure",
    phase: "connecting",
    retryable: false,
    reasonCode: null,
    occurredAt: "2026-07-27T14:02:00Z",
    lastConnectedAt: null,
    enforcedBudgetUsdMicros: 800_000,
    reportedUsageUsdMicros: null,
    deletionScheduledAt: "",
    automaticDeletionWhileOffline: true,
    terminalOutcome: null,
    ...overrides,
  };
}

function fakeClient(
  overrides: Partial<DeveloperHostedRuntimeClient> = {},
): DeveloperHostedRuntimeClient {
  return {
    confirmConnected: async () =>
      hostedStatus({ phase: "connected", terminalOutcome: "connected" }),
    destroy: async () =>
      hostedStatus({ operationKind: "destroy", phase: "destroying", terminalOutcome: null }),
    ensure: async () => hostedStatus({ phase: "preparing" }),
    finalizeRemoval: async () => {},
    readBootstrap: async () => ({
      baseUrl: "https://runtime.test.invalid/",
      deviceId: "device-hosted",
      deviceSecret: "private-device-secret",
      expiresAt: "2026-07-27T14:30:00Z",
      protocolVersion: 1,
      runtimeId: "runtime-hosted",
      token: "private-bootstrap-token",
      userId: "developer-hosted-user",
    }),
    readStatus: async () => null,
    streamStatus: async function* () {},
    ...overrides,
  };
}
