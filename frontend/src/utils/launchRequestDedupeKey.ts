import type { LaunchRequestInput } from "utils/generatedTypes";

export function buildLaunchRequestDedupeKey(
  request: LaunchRequestInput,
): string {
  const canonicalEntries = Object.entries(request as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([left], [right]) => {
      if (left < right) {
        return -1;
      }
      if (left > right) {
        return 1;
      }
      return 0;
    });
  return JSON.stringify(canonicalEntries);
}
