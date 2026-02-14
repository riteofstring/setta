import type { LaunchRequestInput } from "utils/generatedTypes";

export function buildLaunchRequestDedupeKey(
  request: LaunchRequestInput,
): string {
  const sortedEntries = Object.entries(request)
    .filter((entry) => entry[1] !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify(sortedEntries);
}
