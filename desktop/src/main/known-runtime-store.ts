import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface KnownRuntimeRecord {
  runtimeId: string;
  displayName: string;
  baseUrl: string;
  deviceToken: string;
  isLocal: boolean;
  lastConnected: string | null;
}

export interface KnownRuntimeRegistry {
  activeRuntimeId: string | null;
  runtimes: KnownRuntimeRecord[];
}

interface StoredKnownRuntime {
  runtime_id: string;
  display_name: string;
  base_url: string;
  device_token: string;
  is_local: boolean;
  last_connected: string | null;
}

interface StoredKnownRuntimeRegistry {
  schema_version: 1;
  active_runtime_id: string | null;
  runtimes: StoredKnownRuntime[];
}

const registryFileName = "known-runtimes.json";
const registrySchemaVersion = 1;

export class KnownRuntimeStore {
  constructor(private readonly userDataDir: string) {}

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
    return decodeKnownRuntimeRegistry(JSON.parse(raw));
  }

  async write(registry: KnownRuntimeRegistry): Promise<void> {
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(encodeKnownRuntimeRegistry(registry), null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
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
      device_token: runtime.deviceToken,
      display_name: runtime.displayName,
      is_local: runtime.isLocal,
      last_connected: runtime.lastConnected,
      runtime_id: runtime.runtimeId,
    })),
    schema_version: registrySchemaVersion,
  };
}

function decodeKnownRuntimeRegistry(value: unknown): KnownRuntimeRegistry {
  const record = assertRecord(value, "KnownRuntimeRegistry");
  const schemaVersion = record.schema_version;
  if (schemaVersion !== registrySchemaVersion) {
    throw new Error(`KnownRuntimeRegistry.schema_version is unsupported: ${String(schemaVersion)}`);
  }
  const activeRuntimeId = nullableStringField(record, "active_runtime_id", "KnownRuntimeRegistry");
  const rawRuntimes = record.runtimes;
  if (!Array.isArray(rawRuntimes)) {
    throw new Error("KnownRuntimeRegistry.runtimes must be an array");
  }
  const runtimes = rawRuntimes.map((runtime, index) =>
    decodeKnownRuntime(runtime, `KnownRuntimeRegistry.runtimes[${index}]`),
  );
  if (
    activeRuntimeId !== null &&
    !runtimes.some((runtime) => runtime.runtimeId === activeRuntimeId)
  ) {
    throw new Error("KnownRuntimeRegistry.active_runtime_id does not match a known runtime");
  }
  return { activeRuntimeId, runtimes };
}

function decodeKnownRuntime(value: unknown, label: string): KnownRuntimeRecord {
  const record = assertRecord(value, label);
  return {
    baseUrl: stringField(record, "base_url", label),
    deviceToken: stringField(record, "device_token", label),
    displayName: stringField(record, "display_name", label),
    isLocal: booleanField(record, "is_local", label),
    lastConnected: nullableStringField(record, "last_connected", label),
    runtimeId: stringField(record, "runtime_id", label),
  };
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

function isENOENT(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
