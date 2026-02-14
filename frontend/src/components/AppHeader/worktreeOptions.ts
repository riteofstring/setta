import type { LaunchRequestInput } from "utils/generatedTypes";

export type WorktreeOption = {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
};

type RawWorktreeOption = {
  name?: unknown;
  path?: unknown;
  isActive?: unknown;
};

export function normalizeWorktreeOptions(
  rawOptions: unknown,
): Array<WorktreeOption> {
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  const options: Array<WorktreeOption> = [];
  for (const candidate of rawOptions) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const record = candidate as RawWorktreeOption;
    if (typeof record.name !== "string" || typeof record.path !== "string") {
      continue;
    }
    options.push({
      id: record.path,
      name: record.name,
      path: record.path,
      isActive: record.isActive === true,
    });
  }
  options.sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return options;
}

export function getActiveWorktreeOptionId(
  options: Array<WorktreeOption>,
): string | null {
  for (const option of options) {
    if (option.isActive) {
      return option.id;
    }
  }
  return options[0]?.id ?? null;
}

export function buildWorktreeLaunchRequest(
  workspaceRoot: string,
): LaunchRequestInput {
  return {
    workspaceRoot,
    settaFilesLocation: null,
    sshTarget: null,
    sshArgs: null,
    remoteCmd: null,
    localPort: null,
  };
}
