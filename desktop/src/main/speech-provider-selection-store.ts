import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { decodeSpeechProvider, type SpeechProvider } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";
import {
  defaultDesktopSpeechProviderID,
  supportedDesktopSpeechProviderIDs,
} from "@shared/speech-providers";
import type { SpeechProviderSelectionSettings } from "@shared/speech-ipc";

interface StoredSpeechProviderSelection {
  provider: SpeechProvider;
  schema_version: 1;
}

const storageFileName = "speech-provider-selection.json";
const storageSchemaVersion = 1;

export class SpeechProviderSelectionStore {
  constructor(
    private readonly userDataDir: string,
    private readonly platform: DesktopPlatform,
  ) {}

  path(): string {
    return speechProviderSelectionStoragePath(this.userDataDir);
  }

  async read(): Promise<SpeechProviderSelectionSettings> {
    const storedProvider = await this.readStoredProvider();
    return this.settings(storedProvider);
  }

  async update(provider: SpeechProvider): Promise<SpeechProviderSelectionSettings> {
    const settings = this.settings(provider);
    const path = this.path();
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(
      tmpPath,
      JSON.stringify(encodeStoredSelection(settings.provider), null, 2) + "\n",
      {
        mode: 0o600,
      },
    );
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
    return settings;
  }

  private async readStoredProvider(): Promise<SpeechProvider | null> {
    let raw: string;
    try {
      raw = await readFile(this.path(), "utf8");
    } catch (error) {
      if (isENOENT(error)) {
        return null;
      }
      throw error;
    }
    return decodeStoredSelection(JSON.parse(raw)).provider;
  }

  private settings(provider: SpeechProvider | null): SpeechProviderSelectionSettings {
    const defaultProvider = defaultDesktopSpeechProviderID(this.platform);
    const supportedProviders = supportedDesktopSpeechProviderIDs(this.platform);
    const selectedProvider = provider ?? defaultProvider;
    if (!supportedProviders.includes(selectedProvider)) {
      throw new Error(
        `Speech provider ${JSON.stringify(selectedProvider)} is not supported on ${this.platform}.`,
      );
    }
    return {
      defaultProvider,
      provider: selectedProvider,
      supportedProviders,
    };
  }
}

export function speechProviderSelectionStoragePath(userDataDir: string): string {
  return join(userDataDir, storageFileName);
}

function encodeStoredSelection(provider: SpeechProvider): StoredSpeechProviderSelection {
  return {
    provider,
    schema_version: storageSchemaVersion,
  };
}

function decodeStoredSelection(value: unknown): StoredSpeechProviderSelection {
  const record = assertRecord(value, "SpeechProviderSelection");
  const schemaVersion = record.schema_version;
  if (schemaVersion !== storageSchemaVersion) {
    throw new Error(
      `SpeechProviderSelection.schema_version is unsupported: ${String(schemaVersion)}`,
    );
  }
  return {
    provider: decodeSpeechProvider(record.provider, "SpeechProviderSelection.provider"),
    schema_version: storageSchemaVersion,
  };
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (field !== "provider" && field !== "schema_version") {
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
