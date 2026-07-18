import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { speechProviderValues, type SpeechProvider } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  createElectronSafeStorageCredentialProtection,
  SpeechCredentialVault,
  SpeechCredentialVaultError,
  speechCredentialStoragePath,
  type ElectronSafeStorageProtectionOptions,
  type SpeechCredentialProtection,
} from "./speech-credential-vault";

describe("SpeechCredentialVault", () => {
  test("reports a missing credential without creating storage", async () => {
    const userDataDir = await temporaryUserDataDir();
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());

    await expect(vault.read()).resolves.toEqual({ status: "missing" });
    await expect(pathExists(speechCredentialStoragePath(userDataDir))).resolves.toBe(false);
  });

  test("persists only versioned ciphertext and restores the credential", async () => {
    const userDataDir = await temporaryUserDataDir();
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());
    const apiKey = "sk-setta-vault-secret";

    await vault.write(apiKey);

    const storagePath = speechCredentialStoragePath(userDataDir);
    const rawText = await readFile(storagePath, "utf8");
    expect(rawText).not.toContain(apiKey);
    const raw = JSON.parse(rawText) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(["ciphertext_base64", "provider", "schema_version"]);
    expect(raw).toEqual({
      ciphertext_base64: expect.any(String),
      provider: expectedProvider(),
      schema_version: 1,
    });
    expect(raw).not.toHaveProperty("apiKey");
    expect(raw).not.toHaveProperty("clientSecret");
    const mode = (await stat(storagePath)).mode & 0o777;
    expect(mode).toBe(0o600);
    await expect(vault.read()).resolves.toEqual({
      apiKey,
      provider: expectedProvider(),
      status: "present",
    });
  });

  test("replaces and removes the ciphertext atomically at the storage boundary", async () => {
    const userDataDir = await temporaryUserDataDir();
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());
    const firstAPIKey = "sk-setta-vault-first";
    const secondAPIKey = "sk-setta-vault-second";

    await vault.write(firstAPIKey);
    const firstStored = await readFile(speechCredentialStoragePath(userDataDir), "utf8");
    await vault.write(secondAPIKey);

    const secondStored = await readFile(speechCredentialStoragePath(userDataDir), "utf8");
    expect(secondStored).not.toBe(firstStored);
    expect(secondStored).not.toContain(firstAPIKey);
    expect(secondStored).not.toContain(secondAPIKey);
    await expect(vault.read()).resolves.toEqual({
      apiKey: secondAPIKey,
      provider: expectedProvider(),
      status: "present",
    });

    await vault.remove();
    await expect(vault.read()).resolves.toEqual({ status: "missing" });
    await expect(vault.remove()).resolves.toBeUndefined();
  });

  test("restores present and missing recovery snapshots without plaintext state", async () => {
    const userDataDir = await temporaryUserDataDir();
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());
    const firstAPIKey = "sk-setta-vault-recovery-first";
    const secondAPIKey = "sk-setta-vault-recovery-second";

    const missingSnapshot = await vault.createRecoverySnapshot();
    await vault.write(firstAPIKey);
    const firstSnapshot = await vault.createRecoverySnapshot();
    await vault.write(secondAPIKey);

    await vault.restoreRecoverySnapshot(firstSnapshot);

    await expect(vault.read()).resolves.toEqual({
      apiKey: firstAPIKey,
      provider: expectedProvider(),
      status: "present",
    });
    expect(JSON.stringify(firstSnapshot)).not.toContain(firstAPIKey);
    expect(JSON.stringify(firstSnapshot)).not.toContain(secondAPIKey);

    await vault.restoreRecoverySnapshot(missingSnapshot);

    await expect(vault.read()).resolves.toEqual({ status: "missing" });
  });

  test("encrypts before touching the filesystem", async () => {
    const userDataDir = join(await temporaryUserDataDir(), "missing-parent");
    const vault = new SpeechCredentialVault(userDataDir, {
      decryptString: () => {
        throw new Error("unused decrypt");
      },
      encryptString: () => {
        throw new Error("encryption failed");
      },
    });

    await expect(vault.write("sk-setta-never-written")).rejects.toThrow("encryption failed");
    await expect(pathExists(dirname(speechCredentialStoragePath(userDataDir)))).resolves.toBe(
      false,
    );
  });

  test.each([
    {
      reason: "invalid_json",
      stored: "not json",
    },
    {
      reason: "unsupported_schema",
      stored: JSON.stringify({
        ciphertext_base64: Buffer.from("ciphertext").toString("base64"),
        provider: expectedProvider(),
        schema_version: 2,
      }),
    },
    {
      reason: "unsupported_schema",
      stored: JSON.stringify({
        ciphertext_base64: Buffer.from("ciphertext").toString("base64"),
        extra: true,
        provider: expectedProvider(),
        schema_version: 1,
      }),
    },
    {
      reason: "invalid_base64",
      stored: JSON.stringify({
        ciphertext_base64: "not base64",
        provider: expectedProvider(),
        schema_version: 1,
      }),
    },
  ] as const)("reports $reason as a corrupt credential", async ({ reason, stored }) => {
    const userDataDir = await temporaryUserDataDir();
    await writeCredentialFile(userDataDir, stored);
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());

    await expect(vault.read()).resolves.toMatchObject({
      reason,
      status: "corrupt",
    });
    expect(await readFile(speechCredentialStoragePath(userDataDir), "utf8")).toBe(stored);
  });

  test("reports unreadable storage as corrupt without deleting it", async () => {
    const userDataDir = await temporaryUserDataDir();
    await mkdir(speechCredentialStoragePath(userDataDir), { recursive: true });
    const vault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());

    await expect(vault.read()).resolves.toMatchObject({
      reason: "unreadable",
      status: "corrupt",
    });
    await expect(pathExists(speechCredentialStoragePath(userDataDir))).resolves.toBe(true);
  });

  test("reports decrypt failures as corrupt without leaking the decrypt error", async () => {
    const userDataDir = await temporaryUserDataDir();
    await writeCredentialFile(
      userDataDir,
      JSON.stringify({
        ciphertext_base64: Buffer.from("ciphertext").toString("base64"),
        provider: expectedProvider(),
        schema_version: 1,
      }),
    );
    const vault = new SpeechCredentialVault(userDataDir, {
      decryptString: () => {
        throw new Error("provider decrypt failure with implementation details");
      },
      encryptString: (plaintext) => Buffer.from(plaintext),
    });

    const result = await vault.read();
    expect(result).toMatchObject({
      reason: "decrypt_failed",
      status: "corrupt",
    });
    expect(JSON.stringify(result)).not.toContain("implementation details");
  });

  test("wraps storage write and removal failures without credential material", async () => {
    const userDataDir = await temporaryUserDataDir();
    await writeFile(speechCredentialStoragePath(userDataDir), "blocks directory creation");
    const apiKey = "sk-setta-write-failure";
    const nestedVault = new SpeechCredentialVault(
      join(userDataDir, "speech-credential.json", "nested"),
      new ReversibleProtection(),
    );

    const writeError = await rejectedError(nestedVault.write(apiKey));
    expect(writeError).toBeInstanceOf(SpeechCredentialVaultError);
    expect(writeError).toMatchObject({
      code: "write_failed",
    } satisfies Partial<SpeechCredentialVaultError>);
    expect(writeError.message).not.toContain(apiKey);
    expect(String(writeError.cause)).not.toContain(apiKey);

    const directoryVault = new SpeechCredentialVault(userDataDir, new ReversibleProtection());
    await rm(speechCredentialStoragePath(userDataDir), { force: true });
    await mkdir(speechCredentialStoragePath(userDataDir), { recursive: true });
    const removeError = await rejectedError(directoryVault.remove());
    expect(removeError).toBeInstanceOf(SpeechCredentialVaultError);
    expect(removeError).toMatchObject({
      code: "remove_failed",
    } satisfies Partial<SpeechCredentialVaultError>);
  });
});

describe("createElectronSafeStorageCredentialProtection", () => {
  test("requires construction after Electron app readiness", () => {
    expect(() =>
      createElectronSafeStorageCredentialProtection(fakeSafeStorageOptions({ ready: false })),
    ).toThrow(/after app ready/);
  });

  test("requires encryption availability", () => {
    expect(() =>
      createElectronSafeStorageCredentialProtection(
        fakeSafeStorageOptions({ encryptionAvailable: false, platform: "darwin" }),
      ),
    ).toThrow(/encryption is unavailable/);
  });

  test.each(["basic_text", "unknown", "future_secret_service"] as const)(
    "rejects Linux %s safeStorage",
    (backend) => {
      expect(() =>
        createElectronSafeStorageCredentialProtection(
          fakeSafeStorageOptions({ backend, platform: "linux" }),
        ),
      ).toThrow(backend);
    },
  );

  test.each(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"] as const)(
    "delegates encryption through Linux %s safeStorage",
    (backend) => {
      const options = fakeSafeStorageOptions({ backend, platform: "linux" });
      const protection = createElectronSafeStorageCredentialProtection(options);

      const ciphertext = protection.encryptString("sk-setta-safe-storage");

      expect(ciphertext.toString("utf8")).toBe("safe:sk-setta-safe-storage");
      expect(protection.decryptString(ciphertext)).toBe("sk-setta-safe-storage");
      expect(options.safeStorage.getSelectedStorageBackend).toHaveBeenCalledOnce();
      expect(options.safeStorage.isEncryptionAvailable).toHaveBeenCalledOnce();
    },
  );
});

class ReversibleProtection implements SpeechCredentialProtection {
  encryptString(plaintext: string): Buffer {
    return Buffer.from(`cipher:${Buffer.from(plaintext, "utf8").toString("base64")}`, "utf8");
  }

  decryptString(ciphertext: Buffer): string {
    const value = ciphertext.toString("utf8");
    if (!value.startsWith("cipher:")) {
      throw new Error("invalid test ciphertext");
    }
    return Buffer.from(value.slice("cipher:".length), "base64").toString("utf8");
  }
}

function fakeSafeStorageOptions({
  backend = "gnome_libsecret",
  encryptionAvailable = true,
  platform = "darwin",
  ready = true,
}: {
  backend?: string;
  encryptionAvailable?: boolean;
  platform?: NodeJS.Platform;
  ready?: boolean;
} = {}): ElectronSafeStorageProtectionOptions {
  const selectedBackend = backend as ReturnType<
    ElectronSafeStorageProtectionOptions["safeStorage"]["getSelectedStorageBackend"]
  >;
  return {
    app: {
      isReady: vi.fn(() => ready),
    },
    platform,
    safeStorage: {
      decryptString: vi.fn((ciphertext: Buffer) =>
        ciphertext.toString("utf8").replace(/^safe:/u, ""),
      ),
      encryptString: vi.fn((plaintext: string) => Buffer.from(`safe:${plaintext}`, "utf8")),
      getSelectedStorageBackend: vi.fn(() => selectedBackend),
      isEncryptionAvailable: vi.fn(() => encryptionAvailable),
    },
  };
}

async function temporaryUserDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "setta-speech-credential-vault-"));
}

async function writeCredentialFile(userDataDir: string, content: string): Promise<void> {
  const path = speechCredentialStoragePath(userDataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected Error rejection, got ${String(error)}`, { cause: error });
  }
  throw new Error("Expected promise to reject.");
}

function expectedProvider(): SpeechProvider {
  const provider = speechProviderValues[0];
  if (!provider) {
    throw new Error("generated speech provider list is empty");
  }
  return provider;
}
