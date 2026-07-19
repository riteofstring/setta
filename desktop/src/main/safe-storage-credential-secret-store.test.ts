import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  SafeStorageFileCredentialSecretStore,
  type SafeStorageLike,
} from "./safe-storage-credential-secret-store";

describe("SafeStorageFileCredentialSecretStore", () => {
  test("stores encrypted credential payloads in a mode-600 file", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "setta-credential-secrets-"));
    const store = new SafeStorageFileCredentialSecretStore(userDataDir, new FakeSafeStorage());

    await store.setSecret("setta-device-identity:v1:user:device", "device_secret");

    await expect(store.getSecret("setta-device-identity:v1:user:device")).resolves.toBe(
      "device_secret",
    );
    const raw = await readFile(store.path(), "utf8");
    expect(raw).not.toContain("device_secret");
    expect(raw).toContain(Buffer.from("encrypted:device_secret", "utf8").toString("base64"));
    const mode = (await stat(store.path())).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("surfaces unavailable and plaintext-equivalent safeStorage states", async () => {
    const unavailable = new FakeSafeStorage({ encryptionAvailable: false });
    const unavailableStore = new SafeStorageFileCredentialSecretStore(
      await mkdtemp(join(tmpdir(), "setta-credential-secrets-")),
      unavailable,
    );

    expect(unavailableStore.status()).toMatchObject({
      security: "unavailable",
    });
    await expect(unavailableStore.setSecret("ref", "value")).rejects.toThrow(
      "safeStorage encryption is unavailable",
    );

    const plaintextEquivalent = new SafeStorageFileCredentialSecretStore(
      await mkdtemp(join(tmpdir(), "setta-credential-secrets-")),
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
