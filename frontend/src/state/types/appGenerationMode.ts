export type AppGenerationMode = string;

export function parseAppGenerationMode(
  value: unknown,
): AppGenerationMode | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}
