import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface LocalMacOSVoiceListenerStoredSettings {
  enabled: boolean;
}

interface StoredLocalMacOSVoiceListenerSettings extends LocalMacOSVoiceListenerStoredSettings {
  schema_version: 1;
}

const storageFileName = "local-macos-voice-listener.json";
const storageSchemaVersion = 1;

export class LocalMacOSVoiceListenerSettingsStore {
  constructor(private readonly userDataDir: string) {}

  path(): string {
    return join(this.userDataDir, storageFileName);
  }

  async read(): Promise<LocalMacOSVoiceListenerStoredSettings> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return { enabled: false };
      }
      throw error;
    }
    return decodeStoredSettings(JSON.parse(raw));
  }

  async update(settings: LocalMacOSVoiceListenerStoredSettings): Promise<void> {
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(encodeStoredSettings(settings), null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
  }
}

function encodeStoredSettings(
  settings: LocalMacOSVoiceListenerStoredSettings,
): StoredLocalMacOSVoiceListenerSettings {
  return {
    enabled: settings.enabled,
    schema_version: storageSchemaVersion,
  };
}

function decodeStoredSettings(value: unknown): LocalMacOSVoiceListenerStoredSettings {
  const record = assertRecord(value, "LocalMacOSVoiceListenerSettings");
  if (record.schema_version !== storageSchemaVersion) {
    throw new Error(
      `LocalMacOSVoiceListenerSettings.schema_version is unsupported: ${String(
        record.schema_version,
      )}`,
    );
  }
  if (typeof record.enabled !== "boolean") {
    throw new Error("LocalMacOSVoiceListenerSettings.enabled must be a boolean");
  }
  return {
    enabled: record.enabled,
  };
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (field !== "enabled" && field !== "schema_version") {
      throw new Error(label + " contains unknown field " + field);
    }
  }
  return record;
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
