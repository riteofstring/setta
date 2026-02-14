import type { LaunchRequestInput } from "utils/generatedTypes";

export function buildLaunchRequestDedupeKey(
  request: LaunchRequestInput,
): string {
  const canonicalEntries = Object.entries(request as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(canonicalEntries);
}
