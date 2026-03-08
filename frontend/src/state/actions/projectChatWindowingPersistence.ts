import { NULL_PROJECT_CONFIG_ID, useLocalStorage } from "state/definitions";
import {
  createProjectChatWindowingState,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

export function getPersistedProjectChatWindowingState(
  projectConfigId: string,
): ProjectChatWindowingState | null {
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  const persisted =
    useLocalStorage.getState().projectChatWindowingByProjectConfigId[
      projectConfigId
    ];
  if (!persisted) {
    return null;
  }
  return createProjectChatWindowingState(persisted);
}

export function setPersistedProjectChatWindowingState(
  projectConfigId: string,
  state: ProjectChatWindowingState,
): void {
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  useLocalStorage.setState((currentState) => ({
    projectChatWindowingByProjectConfigId: {
      ...currentState.projectChatWindowingByProjectConfigId,
      [projectConfigId]: state,
    },
  }));
}
