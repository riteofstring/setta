import { useProjectState } from "state/definitions";
import { route_set_project_chat_window_chat_id } from "utils/generatedEndpoints";
import {
  setProjectChatWindowChatIdInState,
  setProjectChatWindowTitleInState,
} from "./projectChatWindowingMetadataState";
import { shouldSyncActiveProjectChatId } from "./projectChatWindowingSelectors";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";

export function setProjectChatWindowTitle(
  instanceId: string,
  title: string | null,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowTitleInState(
      currentWindowing,
      instanceId,
      title,
    ),
  }));
}

export function setProjectChatWindowChatId(
  instanceId: string,
  chatId: string | null | undefined,
): void {
  const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
  dispatchProjectChatWindowingMutation((currentWindowing) => {
    const nextProjectChatWindowing = setProjectChatWindowChatIdInState(
      currentWindowing,
      instanceId,
      normalizedChatId,
    );
    const updatedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      send: (projectConfigId, frontendOpId) =>
        route_set_project_chat_window_chat_id({
          projectConfigId,
          instanceId,
          chatId: normalizedChatId,
          frontendOpId,
        }),
      options: shouldSyncActiveProjectChatId(updatedWindow)
        ? {
            syncActiveChatId: updatedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}

export function getCurrentProjectChatWindowingState() {
  return getProjectChatWindowingStateFromStore(useProjectState.getState());
}
