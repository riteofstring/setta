import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { LocalMacOSVoiceHealth } from "@shared/speech-ipc";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";

export interface LocalMacOSVoiceEnvironmentOptions {
  defaultModel?: LocalMacOSVoiceDefaultModelConfiguration;
  resourceRoots?: readonly string[];
}

export interface LocalMacOSVoiceDefaultModelConfiguration {
  modelPath: string;
  modelSHA256: string;
}

export interface LocalMacOSVoiceResolvedConfiguration {
  configurationFailure?: LocalMacOSVoiceUnavailableHealth;
  expectedModelSHA256: string | null;
  helperPath: string | null;
  modelPath: string | null;
}

interface LocalMacOSVoiceResourceManifest {
  helperPath: string | null;
  modelPath: string | null;
  modelSHA256: string | null;
}

type LocalMacOSVoiceResourceManifestReadResult =
  | {
      manifest: LocalMacOSVoiceResourceManifest;
      status: "loaded";
    }
  | {
      status: "missing";
    }
  | {
      health: LocalMacOSVoiceUnavailableHealth;
      status: "unavailable";
    };

type LocalMacOSVoiceUnavailableHealth = Exclude<LocalMacOSVoiceHealth, { status: "ready" }>;

const helperPathEnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_HELPER_PATH";
const modelPathEnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_MODEL_PATH";
const modelSHA256EnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256";
const resourceManifestEnvironmentVariable = "SETTA_LOCAL_MACOS_VOICE_RESOURCE_MANIFEST_PATH";
const resourceManifestFilename = "manifest.json";
const emptyResourceManifest = {
  helperPath: null,
  modelPath: null,
  modelSHA256: null,
} as const satisfies LocalMacOSVoiceResourceManifest;
const localMacOSProvider = localMacOSSpeechProviderID();

export function resolveLocalMacOSVoiceHelperConfiguration(
  env: NodeJS.ProcessEnv,
  resourceRoots: readonly string[],
  defaultModel?: LocalMacOSVoiceDefaultModelConfiguration,
): LocalMacOSVoiceResolvedConfiguration {
  const manifestResult = readLocalMacOSVoiceResourceManifest(env, resourceRoots);
  if (manifestResult.status === "unavailable") {
    return unavailableConfiguration(manifestResult.health);
  }
  const manifest = loadedManifestOrEmpty(manifestResult);
  const explicitOrManifestModelPath = configuredResourceValue(
    env[modelPathEnvironmentVariable],
    manifest.modelPath,
  );
  return {
    expectedModelSHA256: configuredResourceValue(
      env[modelSHA256EnvironmentVariable],
      manifest.modelSHA256 ??
        (explicitOrManifestModelPath === null ? (defaultModel?.modelSHA256 ?? null) : null),
    ),
    helperPath: configuredResourceValue(env[helperPathEnvironmentVariable], manifest.helperPath),
    modelPath: explicitOrManifestModelPath ?? defaultModel?.modelPath ?? null,
  };
}

function loadedManifestOrEmpty(
  result: Extract<
    LocalMacOSVoiceResourceManifestReadResult,
    { status: "loaded" } | { status: "missing" }
  >,
): LocalMacOSVoiceResourceManifest {
  return result.status === "loaded" ? result.manifest : emptyResourceManifest;
}

function configuredResourceValue(
  value: string | undefined,
  fallback: string | null,
): string | null {
  const configured = normalizedOptionalText(value);
  return configured === null ? fallback : configured;
}

function readLocalMacOSVoiceResourceManifest(
  env: NodeJS.ProcessEnv,
  resourceRoots: readonly string[],
): LocalMacOSVoiceResourceManifestReadResult {
  const explicitManifestPath = normalizedOptionalText(env[resourceManifestEnvironmentVariable]);
  if (explicitManifestPath !== null) {
    return readManifestCandidate(explicitManifestPath, true);
  }
  for (const root of resourceRoots) {
    const result = readManifestCandidate(join(root, resourceManifestFilename), false);
    if (result.status !== "missing") {
      return result;
    }
  }
  return { status: "missing" };
}

function readManifestCandidate(
  path: string,
  explicit: boolean,
): LocalMacOSVoiceResourceManifestReadResult {
  if (!existsSync(path)) {
    return explicit
      ? unavailableManifest("The configured local macOS voice resource manifest is missing.")
      : { status: "missing" };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return {
      manifest: decodeLocalMacOSVoiceResourceManifest(parsed, dirname(path)),
      status: "loaded",
    };
  } catch (error) {
    return unavailableManifest(
      `The local macOS voice resource manifest is invalid: ${errorMessage(error)}`,
    );
  }
}

function decodeLocalMacOSVoiceResourceManifest(
  value: unknown,
  manifestDir: string,
): LocalMacOSVoiceResourceManifest {
  const record = assertRecord(value, "LocalMacOSVoiceResourceManifest");
  assertKnownFields(record, "LocalMacOSVoiceResourceManifest", [
    "helperPath",
    "modelPath",
    "modelSHA256",
  ]);
  return {
    helperPath: optionalManifestPath(record, "helperPath", manifestDir),
    modelPath: optionalManifestPath(record, "modelPath", manifestDir),
    modelSHA256: optionalManifestSHA256(record, "modelSHA256"),
  };
}

function optionalManifestPath(
  record: Record<string, unknown>,
  field: "helperPath" | "modelPath",
  manifestDir: string,
): string | null {
  if (!(field in record)) {
    return null;
  }
  const value = requiredTrimmedString(record[field], `LocalMacOSVoiceResourceManifest.${field}`);
  return isAbsolute(value) ? value : resolve(manifestDir, value);
}

function optionalManifestSHA256(
  record: Record<string, unknown>,
  field: "modelSHA256",
): string | null {
  if (!(field in record)) {
    return null;
  }
  const value = requiredTrimmedString(record[field], `LocalMacOSVoiceResourceManifest.${field}`);
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("LocalMacOSVoiceResourceManifest.modelSHA256 must be a SHA-256 hex digest");
  }
  return value;
}

function unavailableConfiguration(
  health: LocalMacOSVoiceUnavailableHealth,
): LocalMacOSVoiceResolvedConfiguration {
  return {
    configurationFailure: health,
    expectedModelSHA256: null,
    helperPath: null,
    modelPath: null,
  };
}

function unavailableManifest(message: string): LocalMacOSVoiceResourceManifestReadResult {
  return {
    health: helperUnavailable(null, message),
    status: "unavailable",
  };
}

function helperUnavailable(
  helperPath: string | null,
  message: string,
): Extract<LocalMacOSVoiceUnavailableHealth, { status: "helper_unavailable" }> {
  return {
    helperPath,
    message,
    provider: localMacOSProvider,
    status: "helper_unavailable",
  };
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

function requiredTrimmedString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new Error(`${label} must be a trimmed string`);
  }
  return value;
}

function normalizedOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
