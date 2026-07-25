import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  deviceIdentitySecretRef,
  type DesktopCredentialStore,
  type DesktopDeviceIdentity,
} from "./desktop-credential-store";

export interface KnownRuntimeRecord {
  runtimeId: string;
  displayName: string;
  baseUrl: string;
  deviceIdentity: DesktopDeviceIdentity;
  isLocal: boolean;
  lastConnected: string | null;
  protocolVersion: number;
}

export interface KnownRuntimeRegistry {
  activeRuntimeId: string | null;
  runtimes: KnownRuntimeRecord[];
}

interface StoredKnownRuntime {
  runtime_id: string;
  display_name: string;
  base_url: string;
  device_identity_ref: string;
  is_local: boolean;
  last_connected: string | null;
  protocol_version: number;
}

interface StoredKnownRuntimeRegistry {
  schema_version: 2;
  active_runtime_id: string | null;
  runtimes: StoredKnownRuntime[];
}

const registryFileName = "known-runtimes.json";
const registrySchemaVersion = 2;

export class KnownRuntimeStore {
  constructor(
    private readonly userDataDir: string,
    private readonly credentialStore: DesktopCredentialStore,
  ) {}

  path(): string {
    return knownRuntimeStoragePath(this.userDataDir);
  }

  async read(): Promise<KnownRuntimeRegistry> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return emptyKnownRuntimeRegistry();
      }
      throw error;
    }
    return this.decodeKnownRuntimeRegistry(JSON.parse(raw));
  }

  async write(registry: KnownRuntimeRegistry): Promise<void> {
    const previousRefs = await this.readStoredDeviceIdentityRefs();
    const currentRefs = new Set(
      registry.runtimes.map((runtime) => deviceIdentitySecretRef(runtime.deviceIdentity)),
    );
    for (const runtime of registry.runtimes) {
      await this.credentialStore.setDeviceIdentity(runtime.deviceIdentity);
    }
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(encodeKnownRuntimeRegistry(registry), null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
    for (const ref of previousRefs) {
      if (!currentRefs.has(ref)) {
        await this.credentialStore.deleteDeviceIdentity(ref);
      }
    }
  }

  private async decodeKnownRuntimeRegistry(value: unknown): Promise<KnownRuntimeRegistry> {
    const record = assertRecord(value, "KnownRuntimeRegistry");
    const schemaVersion = record.schema_version;
    if (schemaVersion !== registrySchemaVersion) {
      throw new Error(
        `KnownRuntimeRegistry.schema_version is unsupported: ${String(schemaVersion)}`,
      );
    }
    const activeRuntimeId = nullableStringField(
      record,
      "active_runtime_id",
      "KnownRuntimeRegistry",
    );
    const rawRuntimes = runtimeArrayField(record);
    const runtimes: KnownRuntimeRecord[] = [];
    for (const [index, runtime] of rawRuntimes.entries()) {
      runtimes.push(
        await this.decodeKnownRuntime(runtime, `KnownRuntimeRegistry.runtimes[${index}]`),
      );
    }
    validateActiveRuntimeId(activeRuntimeId, runtimes);
    return { activeRuntimeId, runtimes };
  }

  private async decodeKnownRuntime(value: unknown, label: string): Promise<KnownRuntimeRecord> {
    const record = assertRecord(value, label);
    const runtimeId = stringField(record, "runtime_id", label);
    const ref = stringField(record, "device_identity_ref", label);
    const identity = await this.credentialStore.getDeviceIdentity(ref);
    if (identity === null) {
      throw new Error(`${label}.device_identity_ref references a missing device identity`);
    }
    const expectedRef = deviceIdentitySecretRef(identity);
    if (ref !== expectedRef) {
      throw new Error(`${label}.device_identity_ref does not match stored device identity`);
    }
    return {
      baseUrl: stringField(record, "base_url", label),
      deviceIdentity: identity,
      displayName: stringField(record, "display_name", label),
      isLocal: booleanField(record, "is_local", label),
      lastConnected: nullableStringField(record, "last_connected", label),
      protocolVersion: integerField(record, "protocol_version", label),
      runtimeId,
    };
  }

  private async readStoredDeviceIdentityRefs(): Promise<Set<string>> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return new Set();
      }
      throw error;
    }
    const record = assertRecord(JSON.parse(raw), "KnownRuntimeRegistry");
    if (record.schema_version !== registrySchemaVersion) {
      return new Set();
    }
    return new Set(
      runtimeArrayField(record).map((runtime, index) =>
        stringField(
          assertRecord(runtime, `KnownRuntimeRegistry.runtimes[${index}]`),
          "device_identity_ref",
          `KnownRuntimeRegistry.runtimes[${index}]`,
        ),
      ),
    );
  }
}

export function knownRuntimeStoragePath(userDataDir: string): string {
  return join(userDataDir, registryFileName);
}

export function emptyKnownRuntimeRegistry(): KnownRuntimeRegistry {
  return { activeRuntimeId: null, runtimes: [] };
}

export function upsertKnownRuntime(
  registry: KnownRuntimeRegistry,
  runtime: KnownRuntimeRecord,
): KnownRuntimeRegistry {
  const runtimes = registry.runtimes.filter((candidate) => {
    if (candidate.runtimeId === runtime.runtimeId) {
      return false;
    }
    return !(runtime.isLocal && candidate.isLocal);
  });
  runtimes.push(runtime);
  runtimes.sort(compareKnownRuntimes);
  const activeRuntimeId =
    registry.activeRuntimeId === null ||
    !runtimes.some((item) => item.runtimeId === registry.activeRuntimeId)
      ? runtime.runtimeId
      : registry.activeRuntimeId;
  return { activeRuntimeId, runtimes };
}

export function removeKnownRuntime(
  registry: KnownRuntimeRegistry,
  runtimeId: string,
): KnownRuntimeRegistry {
  const runtimes = registry.runtimes.filter((runtime) => runtime.runtimeId !== runtimeId);
  const activeRuntimeId =
    registry.activeRuntimeId === runtimeId
      ? (localRuntime(runtimes)?.runtimeId ?? null)
      : registry.activeRuntimeId;
  return { activeRuntimeId, runtimes };
}

function localRuntime(runtimes: KnownRuntimeRecord[]): KnownRuntimeRecord | null {
  return runtimes.find((runtime) => runtime.isLocal) ?? null;
}

function compareKnownRuntimes(left: KnownRuntimeRecord, right: KnownRuntimeRecord): number {
  if (left.isLocal !== right.isLocal) {
    return left.isLocal ? -1 : 1;
  }
  return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
}

function encodeKnownRuntimeRegistry(registry: KnownRuntimeRegistry): StoredKnownRuntimeRegistry {
  return {
    active_runtime_id: registry.activeRuntimeId,
    runtimes: registry.runtimes.map((runtime) => ({
      base_url: runtime.baseUrl,
      device_identity_ref: deviceIdentitySecretRef(runtime.deviceIdentity),
      display_name: runtime.displayName,
      is_local: runtime.isLocal,
      last_connected: runtime.lastConnected,
      protocol_version: runtime.protocolVersion,
      runtime_id: runtime.runtimeId,
    })),
    schema_version: registrySchemaVersion,
  };
}

function runtimeArrayField(record: Record<string, unknown>): unknown[] {
  const rawRuntimes = record.runtimes;
  if (!Array.isArray(rawRuntimes)) {
    throw new Error("KnownRuntimeRegistry.runtimes must be an array");
  }
  return rawRuntimes;
}

function validateActiveRuntimeId(
  activeRuntimeId: string | null,
  runtimes: KnownRuntimeRecord[],
): void {
  if (
    activeRuntimeId !== null &&
    !runtimes.some((runtime) => runtime.runtimeId === activeRuntimeId)
  ) {
    throw new Error("KnownRuntimeRegistry.active_runtime_id does not match a known runtime");
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

function nullableStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label}.${field} must be a string or null`);
  }
  return value;
}

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${field} must be a boolean`);
  }
  return value;
}

function integerField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}.${field} must be a positive integer`);
  }
  return value;
}

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
