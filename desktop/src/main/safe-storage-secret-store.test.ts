import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  SafeStorageFileRuntimeSecretStore,
  type SafeStorageLike,
} from "./safe-storage-secret-store";

describe("SafeStorageFileRuntimeSecretStore", () => {
  test("stores encrypted secret payloads in a mode-600 file", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-runtime-secrets-"));
    const store = new SafeStorageFileRuntimeSecretStore(userDataDir, new FakeSafeStorage());

    await store.setSecret("runtime-device-token:v1:runtime_remote", "remote_token");

    await expect(store.getSecret("runtime-device-token:v1:runtime_remote")).resolves.toBe(
      "remote_token",
    );
    const raw = await readFile(store.path(), "utf8");
    expect(raw).not.toContain("remote_token");
    expect(raw).toContain(Buffer.from("encrypted:remote_token", "utf8").toString("base64"));
    const mode = (await stat(store.path())).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("surfaces unavailable and plaintext-equivalent safeStorage states", async () => {
    const unavailable = new FakeSafeStorage({ encryptionAvailable: false });
    const unavailableStore = new SafeStorageFileRuntimeSecretStore(
      await mkdtemp(join(tmpdir(), "setta-runtime-secrets-")),
      unavailable,
    );

    expect(unavailableStore.status()).toMatchObject({
      security: "unavailable",
    });
    await expect(unavailableStore.setSecret("ref", "value")).rejects.toThrow(
      "safeStorage encryption is unavailable",
    );

    const plaintextEquivalent = new SafeStorageFileRuntimeSecretStore(
      await mkdtemp(join(tmpdir(), "setta-runtime-secrets-")),
      new FakeSafeStorage({ backend: "basic_text" }),
    );
    expect(plaintextEquivalent.status()).toMatchObject({
      backend: "basic_text",
      security: "plaintext-equivalent",
    });
  });
});

class FakeSafeStorage implements SafeStorageLike {
  private readonly backend: string;
  private readonly encryptionAvailable: boolean;

  constructor(
    options: {
      backend?: string;
      encryptionAvailable?: boolean;
    } = {},
  ) {
    this.backend = options.backend ?? "gnome_libsecret";
    this.encryptionAvailable = options.encryptionAvailable ?? true;
  }

  decryptString(encrypted: Buffer): string {
    const value = encrypted.toString("utf8");
    const prefix = "encrypted:";
    if (!value.startsWith(prefix)) {
      throw new Error("invalid ciphertext");
    }
    return value.slice(prefix.length);
  }

  encryptString(plainText: string): Buffer {
    return Buffer.from(`encrypted:${plainText}`, "utf8");
  }

  getSelectedStorageBackend(): string {
    return this.backend;
  }

  isEncryptionAvailable(): boolean {
    return this.encryptionAvailable;
  }
}
