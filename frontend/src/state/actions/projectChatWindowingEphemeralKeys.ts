const PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR = "::";

export type ProjectChatEphemeralWindowInstanceKey = {
  projectConfigId: string;
  instanceId: string;
};

export function buildProjectChatEphemeralWindowInstanceKey(
  projectConfigId: string,
  instanceId: string,
): string {
  const normalizedProjectConfigId = projectConfigId.trim();
  const normalizedInstanceId = instanceId.trim();
  if (!normalizedProjectConfigId) {
    throw new Error("Project config id is required for project chat ephemera.");
  }
  if (!normalizedInstanceId) {
    throw new Error("Instance id is required for project chat ephemera.");
  }
  return `${normalizedProjectConfigId}${PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR}${normalizedInstanceId}`;
}

export function parseProjectChatEphemeralWindowInstanceKey(
  key: string | null | undefined,
): ProjectChatEphemeralWindowInstanceKey | null {
  const normalizedKey = key?.trim() ?? "";
  if (!normalizedKey) {
    return null;
  }
  const separatorIndex = normalizedKey.indexOf(
    PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR,
  );
  if (separatorIndex === -1) {
    return null;
  }
  const projectConfigId = normalizedKey.slice(0, separatorIndex);
  const instanceId = normalizedKey.slice(
    separatorIndex + PROJECT_CHAT_EPHEMERAL_INSTANCE_KEY_SEPARATOR.length,
  );
  if (!projectConfigId || !instanceId) {
    return null;
  }
  return { projectConfigId, instanceId };
}
