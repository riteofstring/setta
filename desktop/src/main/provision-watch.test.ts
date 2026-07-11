import { createHmac } from "node:crypto";
import type { BackendFetch } from "@shared/backend-runtime";
import { backendProtocolVersion } from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { PendingProvisionRecord } from "./pending-provision-store";
import {
  attemptProvisionAutoPair,
  decodeTailscaleStatusNodes,
  tailnetNodeMatchesRuntimeName,
  watchProvisionUntilPaired,
  watchProvisionUntilVerified,
  type TailnetNode,
} from "./provision-watch";

describe("provision watch", () => {
  test("watches through tailnet join, verifies HMAC attestation, and completes pairing", async () => {
    const pending = pendingProvision();
    const node = tailnetNode({
      dnsName: "setta-worker-2.tailnet.ts.net.",
      hostName: "setta-worker-2",
      id: "node-123",
      tags: ["tag:setta-runtime"],
    });
    const calls: Array<{ body: unknown; path: string }> = [];
    const progress: string[] = [];
    let listCalls = 0;

    const result = await watchProvisionUntilPaired({
      clientDisplayName: "Setta Desktop",
      fetchImpl: attestedRuntimeFetch({
        calls,
        pending,
        runtimeId: "runtime_remote",
      }),
      nonce: () => "nonce-000000000000000000000000",
      now: () => new Date("2026-07-07T10:00:00.000Z"),
      onProgress: (event) => progress.push(event.status),
      pending,
      pollIntervalMs: 1,
      sleep: async () => {},
      tailnetClient: {
        listNodes: async () => {
          listCalls += 1;
          return listCalls === 1 ? [] : [node];
        },
      },
    });

    expect(result.baseUrl).toBe("http://setta-worker-2.tailnet.ts.net:7345/");
    expect(result.info.runtimeId).toBe("runtime_remote");
    expect(result.pairing.deviceToken).toBe("device_token");
    expect(progress).toEqual([
      "waiting_for_vm_provider",
      "joined_tailnet",
      "verifying_attestation",
      "pairing_runtime",
      "paired",
    ]);
    expect(calls.map((call) => call.path)).toEqual([
      "/runtime/info",
      "/setup/attestation",
      "/pairing/complete",
    ]);
    expect(calls[2]?.body).toMatchObject({
      clientDisplayName: "Setta Desktop",
      pairingToken: pending.pairingToken,
    });
  });

  test("accepts Tailscale MagicDNS dedup suffixes for the expected runtime name", () => {
    expect(
      tailnetNodeMatchesRuntimeName(
        tailnetNode({ dnsName: "setta-worker-2.tailnet.ts.net", hostName: "setta-worker-2" }),
        "setta-worker",
      ),
    ).toBe(true);
    expect(
      tailnetNodeMatchesRuntimeName(
        tailnetNode({ dnsName: "setta-worker-22.tailnet.ts.net", hostName: "setta-worker-22" }),
        "setta-worker-2",
      ),
    ).toBe(false);
  });

  test("rejects name squatters that lack the required runtime tag before HTTP probing", async () => {
    const pending = pendingProvision();
    const attempt = await attemptProvisionAutoPair({
      clientDisplayName: "Setta Desktop",
      fetchImpl: async () => {
        throw new Error("HTTP should not be called for an untagged candidate");
      },
      now: () => new Date("2026-07-07T10:00:00.000Z"),
      pending,
      tailnetClient: {
        listNodes: async () => [
          tailnetNode({
            dnsName: "setta-worker.tailnet.ts.net",
            hostName: "setta-worker",
            id: "node-squatter",
            tags: [],
          }),
        ],
      },
    });

    expect(attempt.result).toBeNull();
    expect(attempt.rejectedCandidates).toHaveLength(1);
    expect(attempt.rejectedCandidates[0]?.reason).toContain("tag:setta-runtime");
  });

  test("does not release the pairing token to readable-info echo attacks", async () => {
    const pending = pendingProvision();
    const paths: string[] = [];
    const attempt = await attemptProvisionAutoPair({
      clientDisplayName: "Setta Desktop",
      fetchImpl: async (input, init = {}) => {
        paths.push(input.pathname);
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo("runtime_remote"));
        }
        if (input.pathname === "/setup/attestation") {
          const body = JSON.parse(String(init.body));
          return jsonResponse({
            algorithm: "hmac-sha256-v1",
            attestation: "0".repeat(64),
            expiresAt: "2026-07-07T11:00:00.000Z",
            nodeFingerprint: body.nodeFingerprint,
            nonce: body.nonce,
            provisionId: pending.provisionId,
            runtimeId: "runtime_remote",
          });
        }
        throw new Error("pairing token was sent to an unverified candidate");
      },
      nonce: () => "nonce-000000000000000000000000",
      now: () => new Date("2026-07-07T10:00:00.000Z"),
      pending,
      tailnetClient: {
        listNodes: async () => [
          tailnetNode({
            dnsName: "setta-worker.tailnet.ts.net",
            hostName: "setta-worker",
            id: "node-squatter",
            tags: ["tag:setta-runtime"],
          }),
        ],
      },
    });

    expect(attempt.result).toBeNull();
    expect(paths).toEqual(["/runtime/info", "/setup/attestation"]);
    expect(attempt.rejectedCandidates[0]?.reason).toContain("setup attestation");
  });

  test("includes the last rejected candidate reason when a watch times out", async () => {
    const pending = pendingProvision();

    await expect(
      watchProvisionUntilVerified({
        fetchImpl: rejectedAttestationFetch(pending),
        nonce: () => "nonce-000000000000000000000000",
        now: () => new Date("2026-07-07T10:00:00.000Z"),
        pending,
        pollIntervalMs: 1,
        sleep: async () => {},
        tailnetClient: {
          listNodes: async () => [
            tailnetNode({
              dnsName: "setta-worker.tailnet.ts.net",
              hostName: "setta-worker",
              id: "node-squatter",
              tags: ["tag:setta-runtime"],
            }),
          ],
        },
        timeoutMs: 0,
      }),
    ).rejects.toThrow(/setup attestation did not match pending provision/);
  });

  test("parses Tailscale status peers with tags and addresses", () => {
    expect(
      decodeTailscaleStatusNodes({
        Peer: {
          "node-key": {
            DNSName: "setta-worker.tailnet.ts.net.",
            HostName: "setta-worker",
            ID: "node-id",
            Online: true,
            Tags: ["tag:setta-runtime"],
            TailscaleIPs: ["100.64.0.12"],
          },
        },
      }),
    ).toEqual([
      tailnetNode({
        dnsName: "setta-worker.tailnet.ts.net.",
        hostName: "setta-worker",
        id: "node-id",
        publicKey: null,
        tags: ["tag:setta-runtime"],
      }),
    ]);
  });
});

function attestedRuntimeFetch(options: {
  calls: Array<{ body: unknown; path: string }>;
  pending: PendingProvisionRecord;
  runtimeId: string;
}): BackendFetch {
  return async (input, init = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    options.calls.push({ body, path: input.pathname });
    if (input.pathname === "/runtime/info") {
      return jsonResponse(runtimeInfo(options.runtimeId));
    }
    if (input.pathname === "/setup/attestation") {
      return jsonResponse({
        algorithm: "hmac-sha256-v1",
        attestation: setupAttestation({
          attestationKey: options.pending.attestationKey,
          nodeFingerprint: body.nodeFingerprint,
          nonce: body.nonce,
          provisionId: options.pending.provisionId,
          runtimeId: options.runtimeId,
        }),
        expiresAt: "2026-07-07T11:00:00.000Z",
        nodeFingerprint: body.nodeFingerprint,
        nonce: body.nonce,
        provisionId: options.pending.provisionId,
        runtimeId: options.runtimeId,
      });
    }
    if (input.pathname === "/pairing/complete") {
      expect(body.pairingToken).toBe(options.pending.pairingToken);
      return jsonResponse({
        deviceId: "device_desktop",
        deviceToken: "device_token",
        protocolVersion: backendProtocolVersion,
        runtimeId: options.runtimeId,
      });
    }
    throw new Error(`unexpected request: ${input.pathname}`);
  };
}

function rejectedAttestationFetch(pending: PendingProvisionRecord): BackendFetch {
  return async (input, init = {}) => {
    if (input.pathname === "/runtime/info") {
      return jsonResponse(runtimeInfo("runtime_remote"));
    }
    if (input.pathname === "/setup/attestation") {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        algorithm: "hmac-sha256-v1",
        attestation: "0".repeat(64),
        expiresAt: "2026-07-07T11:00:00.000Z",
        nodeFingerprint: body.nodeFingerprint,
        nonce: body.nonce,
        provisionId: pending.provisionId,
        runtimeId: "runtime_remote",
      });
    }
    throw new Error(`unexpected rejected-attestation request: ${input.pathname}`);
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

function pendingProvision(overrides: Partial<PendingProvisionRecord> = {}): PendingProvisionRecord {
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
    ...overrides,
  };
}

function tailnetNode(overrides: Partial<TailnetNode>): TailnetNode {
  return {
    dnsName: "setta-worker.tailnet.ts.net",
    hostName: "setta-worker",
    id: "node-123",
    online: true,
    publicKey: "node-public-key",
    tags: ["tag:setta-runtime"],
    tailscaleIPs: ["100.64.0.12"],
    ...overrides,
  };
}

function runtimeInfo(runtimeId: string) {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "Remote runtime",
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "web_push"],
      version: 1,
    },
    infrastructureProvider: {
      displayName: "Unknown provider",
      iconUrl: "",
      id: "unknown",
    },
    protocolVersion: backendProtocolVersion,
    runtimeId,
    vapidPublicKey: "test-vapid-public-key",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
