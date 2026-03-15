import {
  ChatWindowModeEnum,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { withUpdatedProjectChatWindowInState } from "./projectChatWindowingInstanceState";

export function setProjectChatWindowTitleInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  title: string | null,
): ProjectChatWindowingState {
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
    const normalizedTitle = current.sectionIdOrNull
      ? null
      : title?.trim()
        ? title.trim()
        : null;
    if (current.title === normalizedTitle) {
      return current;
    }
    return {
      ...current,
      title: normalizedTitle,
    };
  });
}

export function setProjectChatWindowChatIdInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  chatId: string | null | undefined,
): ProjectChatWindowingState {
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
    if (current.mode !== ChatWindowModeEnum.project_ai_mode) {
      return current;
    }
    const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
    if (current.chatId === normalizedChatId) {
      return current;
    }
    return {
      ...current,
      chatId: normalizedChatId,
    };
  });
}
