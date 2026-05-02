import { normalizeGeneratedOrigin } from "./bindingRuntime";

export function normalizeOrigin(
  origin: string,
  label: string = "backend origin",
): string | undefined {
  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return undefined;
  }
  const normalized = normalizeGeneratedOrigin(trimmedOrigin);
  if (normalized) {
    return normalized;
  }
  console.error(`Invalid ${label} "${origin}".`);
  return undefined;
}
