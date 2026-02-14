import type { LaunchRequestInput } from "utils/generatedTypes";

const LAUNCH_REQUEST_KEY_ORDER = [
  "workspaceRoot",
  "profile",
  "settaHome",
  "settaFilesRoot",
  "settaFilesLocation",
  "runtimeRoot",
  "sshTarget",
  "sshArgs",
  "remoteCmd",
  "localPort",
] as const satisfies ReadonlyArray<keyof LaunchRequestInput>;

export function buildLaunchRequestDedupeKey(
  request: LaunchRequestInput,
): string {
  const canonicalEntries = LAUNCH_REQUEST_KEY_ORDER.map((key) => [
    key,
    request[key] ?? null,
  ]);
  return JSON.stringify(canonicalEntries);
}
