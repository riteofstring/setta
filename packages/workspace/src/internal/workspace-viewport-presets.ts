import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceViewport } from "./workspace-document-contract.js";
import { validateWorkspaceViewport } from "./workspace-document-validation.js";

export const WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION = 1 as const;

export type WorkspaceViewportPreset = Readonly<{
  id: string;
  name: string;
  viewport: WorkspaceViewport;
}>;

type WorkspaceViewportPresetPayload = Readonly<{
  presets: readonly WorkspaceViewportPreset[];
  schemaVersion: typeof WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION;
}>;

const presetKeys = ["id", "name", "viewport"] as const;
const payloadKeys = ["presets", "schemaVersion"] as const;

function requiredField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): unknown {
  if (!Object.hasOwn(record, key)) {
    throw new TypeError(`${label} must provide ${key}.`);
  }
  return record[key];
}

function trimmedText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new TypeError(`${label} must not start or end with whitespace.`);
  }
  return value;
}

function validateWorkspaceViewportPreset(
  value: unknown,
  index: number,
  ids: Set<string>,
): asserts value is WorkspaceViewportPreset {
  const label = `Workspace viewport preset at index ${String(index)}`;
  const record = optionOverridesAt(value, presetKeys, label, "workspace viewport preset field");
  const id = trimmedText(requiredField(record, "id", label), `${label} id`);
  trimmedText(requiredField(record, "name", label), `${label} name`);
  const viewport = requiredField(record, "viewport", label);
  validateWorkspaceViewport(viewport);
  if (ids.has(id)) {
    throw new TypeError(`Workspace viewport preset id ${JSON.stringify(id)} is duplicated.`);
  }
  ids.add(id);
}

export function validateWorkspaceViewportPresets(
  value: unknown,
): asserts value is readonly WorkspaceViewportPreset[] {
  const presets = denseArrayAt(value, "Workspace viewport presets");
  const ids = new Set<string>();
  presets.forEach((preset, index) => validateWorkspaceViewportPreset(preset, index, ids));
}

function immutableWorkspaceViewportPresets(
  presets: readonly WorkspaceViewportPreset[],
): readonly WorkspaceViewportPreset[] {
  return Object.freeze(
    presets.map((preset) =>
      Object.freeze({
        id: preset.id,
        name: preset.name,
        viewport: Object.freeze({ ...preset.viewport }),
      }),
    ),
  );
}

function parseViewportPresetPayload(serialized: string): unknown {
  if (typeof serialized !== "string") {
    throw new TypeError("Serialized workspace viewport presets must be a string.");
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError("Workspace viewport presets must contain valid JSON.", { cause: error });
    }
    throw error;
  }
}

export function parseWorkspaceViewportPresets(
  serialized: string,
): readonly WorkspaceViewportPreset[] {
  const value = parseViewportPresetPayload(serialized);
  const payload = optionOverridesAt(
    value,
    payloadKeys,
    "Workspace viewport preset payload",
    "workspace viewport preset payload field",
  );
  const schemaVersion = requiredField(
    payload,
    "schemaVersion",
    "Workspace viewport preset payload",
  );
  if (schemaVersion !== WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION) {
    throw new TypeError("Workspace viewport presets use an unsupported schema version.");
  }
  const presets = requiredField(payload, "presets", "Workspace viewport preset payload");
  validateWorkspaceViewportPresets(presets);
  return immutableWorkspaceViewportPresets(presets);
}

export function serializeWorkspaceViewportPresets(
  presets: readonly WorkspaceViewportPreset[],
): string {
  validateWorkspaceViewportPresets(presets);
  const payload: WorkspaceViewportPresetPayload = {
    presets,
    schemaVersion: WORKSPACE_VIEWPORT_PRESETS_SCHEMA_VERSION,
  };
  return JSON.stringify(payload);
}
