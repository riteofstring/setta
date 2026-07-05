import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import type { CloudRuntimeProvisionExecuteRequest, RuntimeRegistrySnapshot } from "@shared/types";
import type { PendingProvisionInput, PendingProvisionRecord } from "./pending-provision-store";
import { runApprovedCloudRuntimeProvision } from "./provision-executor";

describe("cloud runtime provision executor", () => {
  test("renders cloud-init, stores pending secrets before approved up, and hands off to watch", async () => {
    const appDataDir = await mkdtemp(join(tmpdir(), "setta-provision-executor-"));
    const events: string[] = [];
    let pairingTokenHash = "";
    let pendingSeenByWatch: PendingProvisionRecord | null = null;

    const result = await runApprovedCloudRuntimeProvision(requestFixture(), {
      appDataDir,
      env: {
        SETTA_CLI_PATH: "/opt/setta",
        SETTA_CLOUD_PROVISION_WATCH_POLL_INTERVAL_MS: "250",
        SETTA_CLOUD_PROVISION_WATCH_TIMEOUT_MS: "5000",
      },
      execFileRunner: async (command, args) => {
        expect(command).toBe("/opt/setta");
        if (args[0] === "provision" && args[1] === "render-cloudinit") {
          events.push("render-cloudinit");
          pairingTokenHash = requiredArg(args, "--pairing-token-hash");
          expect(requiredArg(args, "--tailscale-auth-key")).toBe("tskey-auth-secret");
          expect(requiredArg(args, "--setta-version")).toBe("v1.2.3");
          expect(requiredArg(args, "--release-base-url")).toBe(
            "https://downloads.example.test/setta/v1.2.3",
          );
          return {
            stderr: "",
            stdout: JSON.stringify({
              cloudInit: "#cloud-config\nsetta: true\n",
              cloudInitSha256: "a".repeat(64),
              ok: true,
            }),
          };
        }
        if (args[0] === "provision" && args[1] === "up") {
          events.push("up");
          expect(events).toContain("upsert");
          expect(args).toContain("--approve");
          expect(requiredArg(args, "--app-data-dir")).toBe(appDataDir);
          const cloudInitPath = requiredArg(args, "--cloud-init-file");
          await expect(readFile(cloudInitPath, "utf8")).resolves.toContain("setta: true");
          expect((await stat(cloudInitPath)).mode & 0o777).toBe(0o600);
          return {
            stderr: "",
            stdout: JSON.stringify(provisionUpOutput(cloudInitPath)),
          };
        }
        throw new Error(`unexpected CLI args: ${args.join(" ")}`);
      },
      now: () => new Date("2026-07-07T10:00:00.000Z"),
      pendingProvisionStore: {
        delete: async (provisionId) => {
          events.push(`delete:${provisionId}`);
        },
        upsert: async (input) => {
          events.push("upsert");
          const pending = pendingFromInput(input);
          expect(createHash("sha256").update(pending.pairingToken).digest("hex")).toBe(
            pairingTokenHash,
          );
          return pending;
        },
      },
      repoRoot: "/repo",
      runtimeRegistry: {
        watchProvisionAndPair: async ({ pending, pollIntervalMs, timeoutMs }) => {
          events.push("watch");
          expect(pollIntervalMs).toBe(250);
          expect(timeoutMs).toBe(5000);
          pendingSeenByWatch = pending;
          return runtimeSnapshot();
        },
      },
      tailscaleOAuthService: {
        mintAuthKey: async () => {
          throw new Error("manual auth path should not mint OAuth keys");
        },
      },
      tailnetClient: {
        listNodes: async () => [],
      },
    });

    expect(result).toMatchObject({
      creationRecord: {
        recordId: "hetzner:setta-worker",
        resourceId: "123",
        runtimeName: "setta-worker",
        status: "succeeded",
      },
      ok: true,
      provider: "hetzner",
      runtimeName: "setta-worker",
    });
    expect(result.snapshot.activeRuntimeId).toBe("runtime_remote");
    expect(pendingSeenByWatch).toMatchObject({
      expectedTag: "tag:setta-runtime",
      runtimeName: "setta-worker",
      runtimePort: 7345,
      scheme: "http",
    });
    expect(events).toEqual([
      "render-cloudinit",
      "upsert",
      "up",
      "watch",
      `delete:${result.provisionId}`,
    ]);
  });
});

function requestFixture(): CloudRuntimeProvisionExecuteRequest {
  return {
    auth: { kind: "manual", tailscaleAuthKey: "tskey-auth-secret" },
    release: {
      installerSha256: "a".repeat(64),
      minisignPublicKey: "RWQtestminisignpublickey",
      releaseBaseUrl: "https://downloads.example.test/setta/v1.2.3",
      settaVersion: "v1.2.3",
    },
    resolution: {
      approval: {
        commandPreview: [],
        requiresMutationApproval: true,
        secretFree: true,
      },
      cost: {
        amount: null,
        class: "standard",
        currency: null,
        description: "catalog cost class",
        kind: "class",
        pricingUrl: "https://www.hetzner.com/cloud",
      },
      diskGB: 64,
      displayName: "Hetzner Cloud",
      imageSelector: {
        description: "Hetzner stable Ubuntu image alias",
        kind: "image_alias",
        value: "ubuntu-24.04",
      },
      instanceType: "cx42",
      machine: {
        cpus: 4,
        diskGB: 64,
        gpuClass: null,
        memoryGB: 16,
      },
      provider: "hetzner",
      region: "fsn1",
      regionOptions: ["fsn1"],
      shape: "dev-standard",
      source: "catalog",
      warnings: [],
    },
    runtimeName: "setta-worker",
  };
}

function provisionUpOutput(cloudInitPath: string) {
  return {
    creationRecord: {
      recordId: "hetzner:setta-worker",
      resourceId: "123",
      runtimeName: "setta-worker",
      status: "succeeded",
    },
    mode: "executed",
    ok: true,
    plan: {
      actionId: "hetzner.server.create_runtime",
      argv: ["hcloud", "server", "create", "--user-data-from-file", cloudInitPath],
      cliBinary: "hcloud",
      fileInputs: [
        {
          name: "cloudInit",
          path: cloudInitPath,
          purpose: "cloud-init user data with provisioning secrets",
          sensitive: true,
          sha256: "b".repeat(64),
          sizeBytes: 26,
        },
      ],
      lastVerified: "2026-07-07",
      mutating: true,
      provider: "hetzner",
      requiresApproval: true,
      secretFree: true,
      teardownActionId: "hetzner.server.delete_runtime",
      typedAction: "create_runtime",
    },
    provider: "hetzner",
    warnings: [],
  };
}

function pendingFromInput(input: PendingProvisionInput): PendingProvisionRecord {
  return {
    attestationKey: input.attestationKey,
    createdAt: input.createdAt ?? "2026-07-07T10:00:00.000Z",
    expectedTag: input.expectedTag ?? "tag:setta-runtime",
    expiresAt: input.expiresAt,
    pairingToken: input.pairingToken,
    provisionId: input.provisionId,
    runtimeName: input.runtimeName,
    runtimePort: input.runtimePort ?? 7345,
    scheme: input.scheme ?? "http",
  };
}

function runtimeSnapshot(): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId: "runtime_remote",
    connection: {
      message: "Connected to setta-worker",
      protocolVersion: 1,
      runtimeId: "runtime_remote",
      status: "connected",
      updatedAt: "2026-07-07T10:00:05.000Z",
    },
    runtimes: [],
    switching: false,
  };
}

function requiredArg(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    throw new Error(`missing ${flag} in ${args.join(" ")}`);
  }
  return args[index + 1] ?? "";
}
