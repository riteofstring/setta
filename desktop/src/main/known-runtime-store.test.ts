import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  KnownRuntimeStore,
  knownRuntimeStoragePath,
  removeKnownRuntime,
  upsertKnownRuntime,
  type KnownRuntimeRecord,
} from "./known-runtime-store";
import { MemoryRuntimeSecretStore } from "./runtime-secret-store";

describe("KnownRuntimeStore", () => {
  test("persists known runtimes with keychain references instead of device tokens", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const secrets = new MemoryRuntimeSecretStore();
    const store = new KnownRuntimeStore(userDataDir, secrets);
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
      displayName: "Remote box",
      isLocal: false,
      runtimeId: "runtime_remote",
    });

    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [remote, local] });

    await expect(store.read()).resolves.toEqual({
      activeRuntimeId: remote.runtimeId,
      runtimes: [remote, local],
    });
    const raw = JSON.parse(await readFile(knownRuntimeStoragePath(userDataDir), "utf8"));
    expect(raw).toMatchObject({
      active_runtime_id: "runtime_remote",
      schema_version: 2,
    });
    expect(raw.runtimes[0]).toHaveProperty(
      "device_token_ref",
      "runtime-device-token:v1:runtime_remote",
    );
    expect(raw.runtimes[0]).not.toHaveProperty("device_token");
    expect(raw.runtimes[0]).not.toHaveProperty("deviceToken");
    await expect(secrets.getSecret("runtime-device-token:v1:runtime_remote")).resolves.toBe(
      "remote_token",
    );
    const mode = (await stat(knownRuntimeStoragePath(userDataDir))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("migrates legacy plaintext device tokens into the secret store on read", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const secrets = new MemoryRuntimeSecretStore();
    const store = new KnownRuntimeStore(userDataDir, secrets);
    await writeFile(
      knownRuntimeStoragePath(userDataDir),
      JSON.stringify(
        {
          active_runtime_id: "runtime_remote",
          runtimes: [
            {
              base_url: "http://100.64.0.12:7345/",
              device_token: "remote_token",
              display_name: "Remote box",
              is_local: false,
              last_connected: null,
              runtime_id: "runtime_remote",
            },
          ],
          schema_version: 1,
        },
        null,
        2,
      ) + "\n",
    );

    await expect(store.read()).resolves.toEqual({
      activeRuntimeId: "runtime_remote",
      runtimes: [
        runtimeRecord({
          baseUrl: "http://100.64.0.12:7345/",
          deviceToken: "remote_token",
          displayName: "Remote box",
          runtimeId: "runtime_remote",
        }),
      ],
    });
    const raw = JSON.parse(await readFile(knownRuntimeStoragePath(userDataDir), "utf8"));
    expect(raw.schema_version).toBe(2);
    expect(raw.runtimes[0]).toHaveProperty(
      "device_token_ref",
      "runtime-device-token:v1:runtime_remote",
    );
    expect(raw.runtimes[0]).not.toHaveProperty("device_token");
    await expect(secrets.getSecret("runtime-device-token:v1:runtime_remote")).resolves.toBe(
      "remote_token",
    );
  });

  test("deletes unused device token secrets after registry writes", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const secrets = new MemoryRuntimeSecretStore();
    const store = new KnownRuntimeStore(userDataDir, secrets);
    const local = runtimeRecord({
      deviceToken: "local_token",
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      deviceToken: "remote_token",
      runtimeId: "runtime_remote",
    });

    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [local, remote] });
    await store.write({ activeRuntimeId: local.runtimeId, runtimes: [local] });

    await expect(secrets.getSecret("runtime-device-token:v1:runtime_local")).resolves.toBe(
      "local_token",
    );
    await expect(secrets.getSecret("runtime-device-token:v1:runtime_remote")).resolves.toBeNull();
  });

  test("upserts one local runtime and falls back to local when removing active remote", () => {
    const firstLocal = runtimeRecord({
      displayName: "Old local",
      isLocal: true,
      runtimeId: "runtime_old_local",
    });
    const nextLocal = runtimeRecord({
      displayName: "New local",
      isLocal: true,
      runtimeId: "runtime_new_local",
    });
    const remote = runtimeRecord({
      displayName: "Remote",
      isLocal: false,
      runtimeId: "runtime_remote",
    });

    const withOldLocal = upsertKnownRuntime({ activeRuntimeId: null, runtimes: [] }, firstLocal);
    const withRemote = upsertKnownRuntime(withOldLocal, remote);
    const withNextLocal = upsertKnownRuntime(withRemote, nextLocal);
    const removedRemote = removeKnownRuntime(
      { ...withNextLocal, activeRuntimeId: remote.runtimeId },
      remote.runtimeId,
    );

    expect(withNextLocal.runtimes.map((runtime) => runtime.runtimeId)).toEqual([
      "runtime_new_local",
      "runtime_remote",
    ]);
    expect(removedRemote.activeRuntimeId).toBe("runtime_new_local");
  });
});

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
