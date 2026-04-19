import sidecar from "../../../generation/non_http_shared/sidecar.json";

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

// Publish app-specific generated values through the SDK so plugins consume the
// supported package surface instead of repo-private generation artifacts.
export const AppGenerationModeEnum =
  readGeneratedStringEnum("AppGenerationMode");

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
