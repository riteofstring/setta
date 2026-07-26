import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { backendProtocolVersion } from "@generated/backend";

import { MemoryCredentialSecretStore } from "./credential-secret-store";
import {
  DesktopCredentialStore,
  deviceIdentitySecretRef,
  type DesktopDeviceIdentity,
} from "./desktop-credential-store";
import {
  KnownRuntimeStore,
  knownRuntimeStoragePath,
  removeKnownRuntime,
  upsertKnownRuntime,
  type KnownRuntimeRecord,
} from "./known-runtime-store";

describe("KnownRuntimeStore", () => {
  test("persists known runtimes with device identity references instead of secrets", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const credentialStore = new DesktopCredentialStore(new MemoryCredentialSecretStore());
    const store = new KnownRuntimeStore(userDataDir, credentialStore);
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
      "device_identity_ref",
      deviceIdentitySecretRef(remote.deviceIdentity),
    );
    expect(raw.runtimes[0]).not.toHaveProperty("device_token");
    expect(raw.runtimes[0]).not.toHaveProperty("deviceToken");
    expect(JSON.stringify(raw)).not.toContain("remote_secret");
    await expect(
      credentialStore.getDeviceIdentity(deviceIdentitySecretRef(remote.deviceIdentity)),
    ).resolves.toEqual(remote.deviceIdentity);
    const mode = (await stat(knownRuntimeStoragePath(userDataDir))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("deletes unused device identity secrets after registry writes", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const credentialStore = new DesktopCredentialStore(new MemoryCredentialSecretStore());
    const store = new KnownRuntimeStore(userDataDir, credentialStore);
    const local = runtimeRecord({
      deviceIdentity: deviceIdentity({ deviceId: "device_local", secret: "local_secret" }),
      isLocal: true,
      runtimeId: "runtime_local",
    });
    const remote = runtimeRecord({
      deviceIdentity: deviceIdentity({ deviceId: "device_remote", secret: "remote_secret" }),
      runtimeId: "runtime_remote",
    });

    await store.write({ activeRuntimeId: remote.runtimeId, runtimes: [local, remote] });
    await store.write({ activeRuntimeId: local.runtimeId, runtimes: [local] });

    await expect(
      credentialStore.getDeviceIdentity(deviceIdentitySecretRef(local.deviceIdentity)),
    ).resolves.toEqual(local.deviceIdentity);
    await expect(
      credentialStore.getDeviceIdentity(deviceIdentitySecretRef(remote.deviceIdentity)),
    ).resolves.toBeNull();
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
