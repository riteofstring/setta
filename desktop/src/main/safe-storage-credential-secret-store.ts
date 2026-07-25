import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  CredentialSecretStorageStatus,
  CredentialSecretStore,
} from "./credential-secret-store";

export interface SafeStorageLike {
  decryptString(encrypted: Buffer): string;
  encryptString(plainText: string): Buffer;
  getSelectedStorageBackend?: () => string;
  isEncryptionAvailable(): boolean;
}

interface StoredSecret {
  encrypted_value: string;
  ref: string;
}

interface StoredSecretRegistry {
  schema_version: 1;
  secrets: StoredSecret[];
}

const credentialSecretFileName = "desktop-credential-secrets.json";
const credentialSecretSchemaVersion = 1;
const linuxPlaintextEquivalentBackend = "basic_text";

export class SafeStorageFileCredentialSecretStore implements CredentialSecretStore {
  constructor(
    private readonly userDataDir: string,
    private readonly safeStorage: SafeStorageLike,
  ) {}

  path(): string {
    return join(this.userDataDir, credentialSecretFileName);
  }

  async deleteSecret(ref: string): Promise<void> {
    requireSecretRef(ref);
    const registry = await this.readRegistry();
    await this.writeRegistry({
      ...registry,
      secrets: registry.secrets.filter((secret) => secret.ref !== ref),
    });
  }

  async getSecret(ref: string): Promise<string | null> {
    requireSecretRef(ref);
    this.requireEncryptionAvailable("decrypt desktop credential secret");
    const registry = await this.readRegistry();
    const secret = registry.secrets.find((candidate) => candidate.ref === ref);
    if (!secret) {
      return null;
    }
    return this.safeStorage.decryptString(Buffer.from(secret.encrypted_value, "base64"));
  }

  async setSecret(ref: string, value: string): Promise<void> {
    requireSecretRef(ref);
    if (value === "") {
      throw new Error("desktop credential secret value is required");
    }
    this.requireEncryptionAvailable("encrypt desktop credential secret");
    const encryptedValue = this.safeStorage.encryptString(value).toString("base64");
    const registry = await this.readRegistry();
    const secrets = registry.secrets.filter((secret) => secret.ref !== ref);
    secrets.push({ encrypted_value: encryptedValue, ref });
    secrets.sort((left, right) => left.ref.localeCompare(right.ref));
    await this.writeRegistry({ ...registry, secrets });
  }

  status(): CredentialSecretStorageStatus {
    if (!this.safeStorage.isEncryptionAvailable()) {
      return {
        backend: this.selectedStorageBackend(),
        message: "Electron safeStorage encryption is unavailable.",
        security: "unavailable",
      };
    }
    if (this.selectedStorageBackend() === linuxPlaintextEquivalentBackend) {
      return {
        backend: linuxPlaintextEquivalentBackend,
        message: "Electron safeStorage is using the Linux basic_text password backend.",
        security: "plaintext-equivalent",
      };
    }
    return {
      backend: this.selectedStorageBackend(),
      message: null,
      security: "encrypted",
    };
  }

  private requireEncryptionAvailable(operation: string): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(`${operation}: Electron safeStorage encryption is unavailable`);
    }
  }

  private selectedStorageBackend(): string {
    return this.safeStorage.getSelectedStorageBackend?.() ?? "platform";
  }

  private async readRegistry(): Promise<StoredSecretRegistry> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return emptyStoredSecretRegistry();
      }
      throw error;
    }
    return decodeStoredSecretRegistry(JSON.parse(raw));
  }

  private async writeRegistry(registry: StoredSecretRegistry): Promise<void> {
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(registry, null, 2) + "\n", { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
  }
}

function emptyStoredSecretRegistry(): StoredSecretRegistry {
  return { schema_version: credentialSecretSchemaVersion, secrets: [] };
}

function decodeStoredSecretRegistry(value: unknown): StoredSecretRegistry {
  const record = assertRecord(value, "DesktopCredentialSecretRegistry");
  if (record.schema_version !== credentialSecretSchemaVersion) {
    throw new Error(
      `DesktopCredentialSecretRegistry.schema_version is unsupported: ${String(record.schema_version)}`,
    );
  }
  const rawSecrets = record.secrets;
  if (!Array.isArray(rawSecrets)) {
    throw new Error("DesktopCredentialSecretRegistry.secrets must be an array");
  }
  return {
    schema_version: credentialSecretSchemaVersion,
    secrets: rawSecrets.map((secret, index) =>
      decodeStoredSecret(secret, `DesktopCredentialSecretRegistry.secrets[${index}]`),
    ),
  };
}

function decodeStoredSecret(value: unknown, label: string): StoredSecret {
  const record = assertRecord(value, label);
  return {
    encrypted_value: stringField(record, "encrypted_value", label),
    ref: stringField(record, "ref", label),
  };
}

function requireSecretRef(ref: string): void {
  if (ref.trim() === "") {
    throw new Error("desktop credential secret ref is required");
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label}.${field} must be a non-empty string`);
  }
  return value;
}

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
