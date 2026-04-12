import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { getEmptySpacePosition } from "state/actions/sections/createSections";
import { SettaAPIPresetConfig } from "utils/generatedTypes";

type SettaApiPreset = {
  label: string;
  route: string;
  buildBody: () => Record<string, unknown>;
};

const SETTA_API_RUNTIME_VALUE_TOKENS = SettaAPIPresetConfig.runtimeValueTokens;

function buildSettaApiRuntimeValuesByToken(): Record<string, unknown> {
  return {
    [SETTA_API_RUNTIME_VALUE_TOKENS.projectConfigId]: getCurrProjectConfigId(),
    [SETTA_API_RUNTIME_VALUE_TOKENS.emptySpacePosition]:
      getEmptySpacePosition(),
  };
}

function resolveSettaApiPresetTemplateValue(
  value: unknown,
  runtimeValuesByToken: Record<string, unknown>,
): unknown {
  if (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(runtimeValuesByToken, value)
  ) {
    return runtimeValuesByToken[value];
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      resolveSettaApiPresetTemplateValue(entry, runtimeValuesByToken),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        resolveSettaApiPresetTemplateValue(entry, runtimeValuesByToken),
      ]),
    );
  }
  return value;
}

function buildSettaApiPresetBody(
  bodyTemplate: Record<string, unknown>,
): Record<string, unknown> {
  return resolveSettaApiPresetTemplateValue(
    bodyTemplate,
    buildSettaApiRuntimeValuesByToken(),
  ) as Record<string, unknown>;
}

export const SETTA_API_PRESETS: Array<SettaApiPreset> =
  SettaAPIPresetConfig.presets.map((preset) => ({
    label: preset.label,
    route: preset.route,
    buildBody: () => buildSettaApiPresetBody(preset.bodyTemplate),
  }));

function getSettaApiPreset(route: string): SettaApiPreset | undefined {
  return SETTA_API_PRESETS.find((preset) => preset.route === route);
}

function buildSettaApiDefaultBody(
  route: string,
): Record<string, unknown> | null {
  const preset = getSettaApiPreset(route);
  if (!preset) {
    return null;
  }
  return preset.buildBody();
}

export function formatSettaApiBody(route: string): string {
  const body = buildSettaApiDefaultBody(route);
  if (!body) {
    return "";
  }
  return JSON.stringify(body, null, 2);
}

export function buildSettaApiPayload(
  route: string,
  rawBody: string,
): Record<string, unknown> {
  const trimmedBody = rawBody.trim();
  const userBody =
    trimmedBody === ""
      ? {}
      : (JSON.parse(trimmedBody) as Record<string, unknown>);
  const presetBody = buildSettaApiDefaultBody(route);
  if (!presetBody) {
    return userBody;
  }
  return { ...presetBody, ...userBody };
}
