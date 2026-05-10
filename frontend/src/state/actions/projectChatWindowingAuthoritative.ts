import type { ProjectChatWindowingState } from "utils/generatedTypes";

const authoritativeProjectChatWindowingByProjectId = new Map<
  string,
  ProjectChatWindowingState
>();

export function recordAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  projectChatWindowing: ProjectChatWindowingState,
): void {
  authoritativeProjectChatWindowingByProjectId.set(
    projectConfigId,
    projectChatWindowing,
  );
}

export function getAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
): ProjectChatWindowingState | null {
  return (
    authoritativeProjectChatWindowingByProjectId.get(projectConfigId) ?? null
  );
}

export function resetAuthoritativeProjectChatWindowingState(): void {
  authoritativeProjectChatWindowingByProjectId.clear();
}
