import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  SpeechCredentialRuntimeClient,
  SpeechCredentialVaultStore,
} from "./speech-credential-coordinator";
import { SpeechCredentialCoordinator } from "./speech-credential-coordinator";
import type {
  SpeechCredentialVaultReadResult,
  SpeechCredentialVaultRecoverySnapshot,
} from "./speech-credential-vault";
import { SpeechCredentialVaultError } from "./speech-credential-vault";

describe("SpeechCredentialCoordinator", () => {
  beforeEach(() => {
    sequence = 0;
  });

  test("validates, snapshots, persists, and loads a new credential in order", async () => {
    const vault = new FakeCredentialVault();
    const runtime = new FakeSpeechCredentialRuntime();
    const published: unknown[] = [];
    const coordinator = new SpeechCredentialCoordinator({
      onSettingsChanged: (settings) => published.push(settings),
      vault,
    });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.saveCredential({
      apiKey: "sk-setta-coordinator-new",
    });

    expect(settings).toEqual({ provider: "openai", status: "configured" });
    expect(vault.persistedAPIKey).toBe("sk-setta-coordinator-new");
    expect(runtime.activeAPIKey).toBe("sk-setta-coordinator-new");
    expect([...runtime.operations, ...vault.operations].sort(bySequence)).toEqual([
      "1:runtime:validate:sk-setta-coordinator-new",
      "2:vault:snapshot",
      "3:vault:write:sk-setta-coordinator-new",
      "4:runtime:load:sk-setta-coordinator-new",
    ]);
    expect(published).toEqual([{ provider: "openai", status: "configured" }]);
  });

  test("rejects structurally invalid candidates before runtime or vault work", async () => {
    const vault = new FakeCredentialVault();
    const runtime = new FakeSpeechCredentialRuntime();
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.saveCredential({
      apiKey: "sk-setta invalid",
    });

    expect(settings).toEqual({
      message: "OpenAI API key must contain only visible ASCII characters.",
      operation: "save",
      status: "failed",
    });
    expect(runtime.operations).toEqual([]);
    expect(vault.operations).toEqual([]);
  });

  test("restores prior ciphertext and runtime credential when candidate load fails", async () => {
    const vault = new FakeCredentialVault("sk-setta-coordinator-old");
    const runtime = new FakeSpeechCredentialRuntime("sk-setta-coordinator-old");
    runtime.failLoadsFor.add("sk-setta-coordinator-new");
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.saveCredential({
      apiKey: "sk-setta-coordinator-new",
    });

    expect(settings).toEqual({
      message: "Failed to load the speech credential. The previous credential was restored.",
      operation: "save",
      status: "failed",
    });
    expect(vault.persistedAPIKey).toBe("sk-setta-coordinator-old");
    expect(runtime.activeAPIKey).toBe("sk-setta-coordinator-old");
    expect([...runtime.operations, ...vault.operations].sort(bySequence)).toEqual([
      "1:runtime:validate:sk-setta-coordinator-new",
      "2:vault:snapshot",
      "3:vault:write:sk-setta-coordinator-new",
      "4:runtime:load:sk-setta-coordinator-new",
      "5:vault:restore:present",
      "6:vault:read",
      "7:runtime:load:sk-setta-coordinator-old",
    ]);
  });

  test("clears runtime and removes candidate ciphertext when load fails without a prior credential", async () => {
    const vault = new FakeCredentialVault();
    const runtime = new FakeSpeechCredentialRuntime("sk-setta-runtime-session-only");
    runtime.failLoadsFor.add("sk-setta-coordinator-new");
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.saveCredential({
      apiKey: "sk-setta-coordinator-new",
    });

    expect(settings).toEqual({
      message: "Failed to load the speech credential. The previous credential was restored.",
      operation: "save",
      status: "failed",
    });
    expect(vault.persistedAPIKey).toBeNull();
    expect(runtime.activeAPIKey).toBeNull();
    expect([...runtime.operations, ...vault.operations].sort(bySequence)).toEqual([
      "1:runtime:validate:sk-setta-coordinator-new",
      "2:vault:snapshot",
      "3:vault:write:sk-setta-coordinator-new",
      "4:runtime:load:sk-setta-coordinator-new",
      "5:vault:restore:missing",
      "6:vault:remove",
      "7:runtime:clear",
    ]);
  });

  test("reports inconsistent rollback when the previous snapshot cannot be restored", async () => {
    const vault = new FakeCredentialVault("sk-setta-coordinator-old");
    vault.restoreError = new Error("restore failed");
    const runtime = new FakeSpeechCredentialRuntime("sk-setta-coordinator-old");
    runtime.failLoadsFor.add("sk-setta-coordinator-new");
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.saveCredential({
      apiKey: "sk-setta-coordinator-new",
    });

    expect(settings).toEqual({
      message:
        "Speech credential save failed and rollback could not restore the prior stored credential.",
      operation: "save",
      status: "failed",
    });
    expect(JSON.stringify(settings)).not.toContain("sk-setta-coordinator-new");
    expect(JSON.stringify(settings)).not.toContain("sk-setta-coordinator-old");
  });

  test("removes persisted credential before clearing the local runtime", async () => {
    const vault = new FakeCredentialVault("sk-setta-coordinator-old");
    const runtime = new FakeSpeechCredentialRuntime("sk-setta-coordinator-old");
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.removeCredential();

    expect(settings).toEqual({ provider: "openai", status: "not_configured" });
    expect(vault.persistedAPIKey).toBeNull();
    expect(runtime.activeAPIKey).toBeNull();
    expect([...runtime.operations, ...vault.operations].sort(bySequence)).toEqual([
      "1:vault:remove",
      "2:runtime:clear",
    ]);
  });

  test("does not recreate deleted ciphertext when runtime clear fails", async () => {
    const vault = new FakeCredentialVault("sk-setta-coordinator-old");
    const runtime = new FakeSpeechCredentialRuntime("sk-setta-coordinator-old");
    runtime.clearError = new Error("clear failed");
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const settings = await coordinator.removeCredential();

    expect(settings).toEqual({
      message:
        "The saved speech credential was removed, but the current local runtime may retain it until it exits.",
      operation: "remove",
      status: "failed",
    });
    expect(vault.persistedAPIKey).toBeNull();
    expect(runtime.activeAPIKey).toBe("sk-setta-coordinator-old");
  });

  test("rejects duplicate credential operations without a second runtime call", async () => {
    const vault = new FakeCredentialVault();
    const runtime = new FakeSpeechCredentialRuntime();
    const validation = deferred();
    runtime.beforeValidate = () => validation.promise;
    const coordinator = new SpeechCredentialCoordinator({ vault });
    coordinator.setLocalRuntime({ client: runtime, runtimeId: "runtime_local" });

    const first = coordinator.saveCredential({ apiKey: "sk-setta-coordinator-first" });
    await vi.waitFor(() => {
      expect(runtime.operations).toEqual(["1:runtime:validate:sk-setta-coordinator-first"]);
    });
    const second = await coordinator.saveCredential({
      apiKey: "sk-setta-coordinator-second",
    });
    validation.resolve();

    expect(second).toEqual({
      message: "A speech credential operation is already in progress.",
      operation: "save",
      status: "failed",
    });
    await expect(first).resolves.toEqual({ provider: "openai", status: "configured" });
    expect(runtime.operations.filter((operation) => operation.includes(":validate:"))).toHaveLength(
      1,
    );
  });

  test("surfaces corrupt and unavailable secure storage states", async () => {
    const corruptVault = new FakeCredentialVault();
    corruptVault.recoverySnapshot = {
      message: "The saved speech credential ciphertext is invalid.",
      reason: "invalid_base64",
      status: "corrupt",
    };
    const corruptCoordinator = new SpeechCredentialCoordinator({ vault: corruptVault });
    corruptCoordinator.setLocalRuntime({
      client: new FakeSpeechCredentialRuntime(),
      runtimeId: "runtime_local",
    });
    const unavailable = new SpeechCredentialCoordinator({
      secureStorageUnavailableMessage: "Electron safeStorage encryption is unavailable.",
      vault: null,
    });

    await expect(corruptCoordinator.saveCredential({ apiKey: "sk-setta-new" })).resolves.toEqual({
      message: "The saved speech credential ciphertext is invalid.",
      reason: "invalid_base64",
      status: "corrupt",
    });
    await expect(unavailable.readCredentialSettings()).resolves.toEqual({
      message: "Electron safeStorage encryption is unavailable.",
      status: "secure_storage_unavailable",
    });
  });
});

class FakeCredentialVault implements SpeechCredentialVaultStore {
  operations: string[] = [];
  persistedAPIKey: string | null;
  recoverySnapshot: SpeechCredentialVaultRecoverySnapshot | null = null;
  removeError: Error | null = null;
  restoreError: Error | null = null;
  writeError: Error | null = null;

  constructor(initialAPIKey: string | null = null) {
    this.persistedAPIKey = initialAPIKey;
  }

  async createRecoverySnapshot(): Promise<SpeechCredentialVaultRecoverySnapshot> {
    this.record("vault:snapshot");
    if (this.recoverySnapshot) {
      return this.recoverySnapshot;
    }
    if (this.persistedAPIKey === null) {
      return { status: "missing" };
    }
    return {
      status: "present",
      storedCredentialJSON: JSON.stringify({ apiKey: this.persistedAPIKey }),
    };
  }

  async read(): Promise<SpeechCredentialVaultReadResult> {
    this.record("vault:read");
    if (this.persistedAPIKey === null) {
      return { status: "missing" };
    }
    return {
      apiKey: this.persistedAPIKey,
      provider: "openai",
      status: "present",
    };
  }

  async remove(): Promise<void> {
    this.record("vault:remove");
    if (this.removeError) {
      throw this.removeError;
    }
    this.persistedAPIKey = null;
  }

  async restoreRecoverySnapshot(snapshot: SpeechCredentialVaultRecoverySnapshot): Promise<void> {
    this.record(`vault:restore:${snapshot.status}`);
    if (this.restoreError) {
      throw this.restoreError;
    }
    switch (snapshot.status) {
      case "corrupt":
        throw new SpeechCredentialVaultError("write_failed", "cannot restore corrupt snapshot");
      case "missing":
        await this.remove();
        return;
      case "present":
        this.persistedAPIKey = (
          JSON.parse(snapshot.storedCredentialJSON) as { apiKey: string }
        ).apiKey;
        return;
      default:
        assertNever(snapshot);
    }
  }

  async write(apiKey: string): Promise<void> {
    this.record(`vault:write:${apiKey}`);
    if (this.writeError) {
      throw this.writeError;
    }
    this.persistedAPIKey = apiKey;
  }

  private record(operation: string): void {
    this.operations.push(`${nextSequence()}:${operation}`);
  }
}

class FakeSpeechCredentialRuntime implements SpeechCredentialRuntimeClient {
  activeAPIKey: string | null;
  beforeValidate: (() => Promise<void>) | null = null;
  clearError: Error | null = null;
  failLoadsFor = new Set<string>();
  operations: string[] = [];
  validateError: Error | null = null;

  constructor(initialAPIKey: string | null = null) {
    this.activeAPIKey = initialAPIKey;
  }

  async validateDesktopSpeechCredential({ apiKey }: { apiKey: string }) {
    this.record(`runtime:validate:${apiKey}`);
    await this.beforeValidate?.();
    if (this.validateError) {
      throw this.validateError;
    }
    return { provider: "openai" as const, valid: true };
  }

  async loadDesktopSpeechCredential({ apiKey }: { apiKey: string }) {
    this.record(`runtime:load:${apiKey}`);
    if (this.failLoadsFor.has(apiKey)) {
      throw new Error("load failed");
    }
    this.activeAPIKey = apiKey;
    return { provider: "openai" as const, providerStatus: "configured" as const };
  }

  async clearDesktopSpeechCredential() {
    this.record("runtime:clear");
    if (this.clearError) {
      throw this.clearError;
    }
    this.activeAPIKey = null;
    return { provider: "openai" as const, providerStatus: "not_configured" as const };
  }

  private record(operation: string): void {
    this.operations.push(`${nextSequence()}:${operation}`);
  }
}

let sequence = 0;

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

function bySequence(left: string, right: string): number {
  return Number(left.split(":")[0]) - Number(right.split(":")[0]);
}

function deferred() {
  let resolve: () => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function assertNever(value: never): never {
  throw new Error(`unexpected test state: ${String(value)}`);
}
