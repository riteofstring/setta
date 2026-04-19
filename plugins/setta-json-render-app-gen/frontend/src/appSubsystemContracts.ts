import sidecar from "../../../../frontend/generation/non_http_shared/sidecar.json";
import type { AppsubsystemAppdefinitionAppDefinition as GeneratedAppDefinition } from "@setta/app-subsystem-frontend-sdk";

type SidecarExportedValueEntry = {
  name: string;
  value: unknown;
};

type SidecarEnumEntry = {
  kind: string;
  name: string;
  enumValues?: Array<{
    name: string;
    value: string;
  }>;
};

function readGeneratedExportedValue<T>(name: string): T {
  const entry = (sidecar.exportedValues as SidecarExportedValueEntry[]).find(
    (candidate) => candidate.name === name,
  );
  if (!entry) {
    throw new Error(
      `Missing generated app exported value ${JSON.stringify(name)}. Regenerate frontend bindings.`,
    );
  }
  return entry.value as T;
}

function readGeneratedStringEnum(
  name: string,
): Readonly<Record<string, string>> {
  const entry = (sidecar.contracts as SidecarEnumEntry[]).find(
    (candidate) => candidate.kind === "enum" && candidate.name === name,
  );
  const values = entry?.enumValues ?? [];
  if (values.length === 0) {
    throw new Error(
      `Missing generated string enum ${JSON.stringify(name)} in shared sidecar.`,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      values.map((candidate) => [candidate.name, candidate.value]),
    ),
  );
}

export const AppGenerationModeEnum =
  readGeneratedStringEnum("AppGenerationMode");

export type AppDefinition = GeneratedAppDefinition;
export type AppRoute = NonNullable<AppDefinition["routes"]>[number];
export type AppGenerationMode =
  (typeof AppGenerationModeEnum)[keyof typeof AppGenerationModeEnum];

export function createAppDefinition(
  options: Partial<AppDefinition> = {},
): AppDefinition {
  return options as AppDefinition;
}

// Read app-only generated values from the authoritative shared sidecar here so
// generic host helpers do not need to re-export app-subsystem contracts.
export const AppSpecPatchPolicyConfig = readGeneratedExportedValue<{
  allowedOps: string[];
  commentPrefix: string;
  elementsPathPrefix: string;
  rootPath: string;
  rootResetValue: string;
  valueOptionalOps: string[];
}>("AppSpecPatchPolicyConfig");

export const AppSubsystemChatUIConfig = readGeneratedExportedValue<{
  customSlashCommandModeOptions: Array<{
    label: string;
    requiresImageAttachment: boolean;
    value: string;
  }>;
  defaultCustomSlashCommandMode: string;
  slashCommands: Array<{
    action: string;
    appGenerationMode: string;
    command: string;
    promptTemplate: string;
    summary: string;
  }>;
}>("AppSubsystemChatUIConfig");
