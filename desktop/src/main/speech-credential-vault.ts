import type { App, SafeStorage } from "electron";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { speechProviderValues, type SpeechProvider } from "@generated/backend";

export interface SpeechCredentialProtection {
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export type SpeechCredentialVaultReadResult =
  | { status: "missing" }
  | { status: "present"; apiKey: string; provider: SpeechProvider }
  | {
      status: "corrupt";
      reason: SpeechCredentialVaultCorruptionReason;
      message: string;
    };

export type SpeechCredentialVaultCorruptionReason =
  | "unreadable"
  | "invalid_json"
  | "unsupported_schema"
  | "invalid_base64"
  | "decrypt_failed";

export type SpeechCredentialVaultErrorCode =
  | "secure_storage_unavailable"
  | "write_failed"
  | "remove_failed";

export class SpeechCredentialVaultError extends Error {
  constructor(
    readonly code: SpeechCredentialVaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpeechCredentialVaultError";
  }
}

export interface ElectronSafeStorageProtectionOptions {
  app: Pick<App, "isReady">;
  safeStorage: Pick<
    SafeStorage,
    "decryptString" | "encryptString" | "getSelectedStorageBackend" | "isEncryptionAvailable"
  >;
  platform?: NodeJS.Platform;
}

interface StoredSpeechCredential {
  schema_version: 1;
  provider: SpeechProvider;
  ciphertext_base64: string;
}

const storageFileName = "speech-credential.json";
const storageSchemaVersion = 1;
const openAISpeechProvider = onlySupportedSpeechProvider();
const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class SpeechCredentialVault {
  constructor(
    private readonly userDataDir: string,
    private readonly protection: SpeechCredentialProtection,
  ) {}

  path(): string {
    return speechCredentialStoragePath(this.userDataDir);
  }

  async read(): Promise<SpeechCredentialVaultReadResult> {
    const stored = await this.readStoredCredential();
    if (stored.status !== "present") {
      return stored;
    }

    let apiKey: string;
    try {
      apiKey = this.protection.decryptString(stored.ciphertext);
    } catch {
      return corruptCredential("decrypt_failed");
    }
    return { apiKey, provider: stored.provider, status: "present" };
  }

  async write(apiKey: string): Promise<void> {
    const ciphertext = this.protection.encryptString(apiKey);
    const path = this.path();
    const tmpPath = temporaryCredentialPath(path);
    const stored = encodeStoredCredential(ciphertext);

    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(tmpPath, JSON.stringify(stored, null, 2) + "\n", { mode: 0o600 });
      await chmod(tmpPath, 0o600);
      await rename(tmpPath, path);
    } catch {
      await removeTemporaryCredentialFile(tmpPath);
      throw new SpeechCredentialVaultError(
        "write_failed",
        "Failed to persist the speech credential.",
      );
    }
  }

  async remove(): Promise<void> {
    try {
      await unlink(this.path());
    } catch (error) {
      if (isENOENT(error)) {
        return;
      }
      throw new SpeechCredentialVaultError(
        "remove_failed",
        "Failed to remove the speech credential.",
      );
    }
  }

  private async readStoredCredential(): Promise<
    | { status: "missing" }
    | { status: "present"; ciphertext: Buffer; provider: SpeechProvider }
    | { status: "corrupt"; reason: SpeechCredentialVaultCorruptionReason; message: string }
  > {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return { status: "missing" };
      }
      return corruptCredential("unreadable");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return corruptCredential("invalid_json");
    }

    let stored: StoredSpeechCredential;
    try {
      stored = decodeStoredCredential(parsed);
    } catch {
      return corruptCredential("unsupported_schema");
    }

    const ciphertext = decodeCanonicalBase64(stored.ciphertext_base64);
    if (!ciphertext) {
      return corruptCredential("invalid_base64");
    }
    return { ciphertext, provider: stored.provider, status: "present" };
  }
}

export function createElectronSafeStorageCredentialProtection({
  app,
  platform = process.platform,
  safeStorage,
}: ElectronSafeStorageProtectionOptions): SpeechCredentialProtection {
  if (!app.isReady()) {
    throw new SpeechCredentialVaultError(
      "secure_storage_unavailable",
      "Electron safeStorage must be created after app ready.",
    );
  }

  if (platform === "linux") {
    const backend = safeStorage.getSelectedStorageBackend();
    if (backend === "basic_text" || backend === "unknown") {
      throw new SpeechCredentialVaultError(
        "secure_storage_unavailable",
        `Electron safeStorage selected an unsupported Linux backend: ${backend}.`,
      );
    }
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new SpeechCredentialVaultError(
      "secure_storage_unavailable",
      "Electron safeStorage encryption is unavailable.",
    );
  }

  return {
    decryptString: (ciphertext) => safeStorage.decryptString(ciphertext),
    encryptString: (plaintext) => safeStorage.encryptString(plaintext),
  };
}

export function speechCredentialStoragePath(userDataDir: string): string {
  return join(userDataDir, storageFileName);
}

function encodeStoredCredential(ciphertext: Buffer): StoredSpeechCredential {
  return {
    ciphertext_base64: ciphertext.toString("base64"),
    provider: openAISpeechProvider,
    schema_version: storageSchemaVersion,
  };
}

function decodeStoredCredential(value: unknown): StoredSpeechCredential {
  const record = assertRecord(value, "SpeechCredential");
  assertKnownFields(record, "SpeechCredential", [
    "ciphertext_base64",
    "provider",
    "schema_version",
  ]);
  if (record.schema_version !== storageSchemaVersion) {
    throw new Error("SpeechCredential.schema_version is unsupported");
  }
  const provider = record.provider;
  if (provider !== openAISpeechProvider) {
    throw new Error("SpeechCredential.provider is unsupported");
  }
  const ciphertextBase64 = record.ciphertext_base64;
  if (typeof ciphertextBase64 !== "string" || ciphertextBase64 === "") {
    throw new Error("SpeechCredential.ciphertext_base64 must be a non-empty string");
  }
  return {
    ciphertext_base64: ciphertextBase64,
    provider,
    schema_version: storageSchemaVersion,
  };
}

function decodeCanonicalBase64(value: string): Buffer | null {
  if (!canonicalBase64Pattern.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    return null;
  }
  return decoded;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(
  record: Record<string, unknown>,
  label: string,
  fields: readonly string[],
): void {
  const known = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!known.has(field)) {
      throw new Error(`${label} contains unknown field ${field}`);
    }
  }
}

function corruptCredential(
  reason: SpeechCredentialVaultCorruptionReason,
): Extract<SpeechCredentialVaultReadResult, { status: "corrupt" }> {
  return {
    message: speechCredentialCorruptMessage(reason),
    reason,
    status: "corrupt",
  };
}

function speechCredentialCorruptMessage(reason: SpeechCredentialVaultCorruptionReason): string {
  switch (reason) {
    case "decrypt_failed":
      return "The saved speech credential could not be decrypted.";
    case "invalid_base64":
      return "The saved speech credential ciphertext is invalid.";
    case "invalid_json":
      return "The saved speech credential file is not valid JSON.";
    case "unreadable":
      return "The saved speech credential file could not be read.";
    case "unsupported_schema":
      return "The saved speech credential file has an unsupported schema.";
    default:
      return assertNever(reason);
  }
}

function temporaryCredentialPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
}

async function removeTemporaryCredentialFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissingPath(error)) {
      throw error;
    }
  }
}

function onlySupportedSpeechProvider(): SpeechProvider {
  const provider = speechProviderValues[0];
  if (!provider || speechProviderValues.length !== 1) {
    throw new Error("Speech credential vault requires exactly one supported speech provider.");
  }
  return provider;
}

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isMissingPath(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected speech credential vault state: ${String(value)}`);
}
