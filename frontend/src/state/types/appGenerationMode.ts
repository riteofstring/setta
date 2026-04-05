import {
  AppGenerationModeEnum,
  type AppGenerationMode as GeneratedAppGenerationMode,
} from "utils/generatedTypes";

const appGenerationModeSet = new Set<GeneratedAppGenerationMode>(
  Object.values(AppGenerationModeEnum),
);

export type AppGenerationMode = GeneratedAppGenerationMode;

export function parseAppGenerationMode(
  value: unknown,
): AppGenerationMode | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim() as AppGenerationMode;
  if (!trimmed || !appGenerationModeSet.has(trimmed)) {
    return null;
  }
  return trimmed;
}
