import { describe, expect, test } from "vitest";

import type { PendingProvisionRecord } from "./pending-provision-store";
import { resumePendingProvisionWatches } from "./provision-watch-resume";
import type { TailnetClient } from "./provision-watch";

describe("resumePendingProvisionWatches", () => {
  test("resumes pending provision watches and deletes successful records", async () => {
    const provision = pendingProvision("provision_success");
    const deleted: string[] = [];
    const watched: string[] = [];

    await resumePendingProvisionWatches({
      registry: {
        watchProvisionAndPair: async (options) => {
          watched.push(options.pending.provisionId);
          return runtimeSnapshot();
        },
      },
      store: {
        delete: async (provisionId) => {
          deleted.push(provisionId);
        },
        readAll: async () => [provision],
      },
      tailnetClient: tailnetClient(),
    });

    expect(watched).toEqual(["provision_success"]);
    expect(deleted).toEqual(["provision_success"]);
  });

  test("keeps failed provision records for later diagnosis or retry", async () => {
    const provision = pendingProvision("provision_failed");
    const deleted: string[] = [];
    const failures: string[] = [];

    await resumePendingProvisionWatches({
      onError: ({ provision: failed }) => {
        failures.push(failed.provisionId);
      },
      registry: {
        watchProvisionAndPair: async () => {
          throw new Error("watch failed");
        },
      },
      store: {
        delete: async (provisionId) => {
          deleted.push(provisionId);
        },
        readAll: async () => [provision],
      },
      tailnetClient: tailnetClient(),
    });

    expect(failures).toEqual(["provision_failed"]);
    expect(deleted).toEqual([]);
  });
});

function pendingProvision(provisionId: string): PendingProvisionRecord {
  return {
    attestationKey: "attestation-key-000000000000000000000000",
    createdAt: "2026-07-07T10:00:00.000Z",
    expectedTag: "tag:setta-runtime",
    expiresAt: "2026-07-07T11:00:00.000Z",
    pairingToken: "pairing-token-000000000000000000000000",
    provisionId,
    runtimeName: "setta-worker",
    runtimePort: 7345,
    scheme: "http",
  };
}

function tailnetClient(): TailnetClient {
  return { listNodes: async () => [] };
}

function runtimeSnapshot() {
  return {
    activeRuntimeId: "runtime_remote",
    connection: {
      message: "Connected",
      protocolVersion: 1,
      runtimeId: "runtime_remote",
      status: "connected" as const,
      updatedAt: "2026-07-07T10:00:00.000Z",
    },
    runtimes: [],
    switching: false,
  };
}
