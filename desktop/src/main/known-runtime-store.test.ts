import { mkdtemp, readFile, stat } from "node:fs/promises";
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

describe("KnownRuntimeStore", () => {
  test("persists known runtimes without exposing implementation-only paths", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-known-runtimes-"));
    const store = new KnownRuntimeStore(userDataDir);
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
      schema_version: 1,
    });
    expect(raw.runtimes[0]).toHaveProperty("device_token", "remote_token");
    expect(raw.runtimes[0]).not.toHaveProperty("deviceToken");
    const mode = (await stat(knownRuntimeStoragePath(userDataDir))).mode & 0o777;
    expect(mode).toBe(0o600);
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
