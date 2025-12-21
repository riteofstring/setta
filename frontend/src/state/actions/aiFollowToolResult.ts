import { useAIFollowToolResult } from "state/definitions";
import { AIFollowToolResultUpdateContent } from "utils/generatedTypes";

const TOOL_RESULT_HIGHLIGHT_TIMEOUT_MS = 2000;
const toolResultTimeouts = new Map<string, number>();

function buildTimeoutKey(
  projectConfigId: string,
  chatId: string,
  idType: string,
  id: string,
): string {
  return `${projectConfigId}:${chatId}:${idType}:${id}`;
}

export function receiveAIFollowToolResultUpdate(
  payload: AIFollowToolResultUpdateContent,
): void {
  const { projectConfigId, chatId, idsByType } = payload;
  useAIFollowToolResult.setState((state) => {
    const projectEntries =
      state.idsByProjectConfigId[projectConfigId] ??
      (state.idsByProjectConfigId[projectConfigId] = {});
    const chatEntries =
      projectEntries[chatId] ?? (projectEntries[chatId] = {});
    for (const [idType, ids] of Object.entries(idsByType)) {
      if (!chatEntries[idType]) {
        chatEntries[idType] = [];
      }
      const storedIds = chatEntries[idType];
      for (const id of ids) {
        if (!storedIds.includes(id)) {
          storedIds.push(id);
        }
      }
    }
  });

  for (const [idType, ids] of Object.entries(idsByType)) {
    for (const id of ids) {
      const key = buildTimeoutKey(projectConfigId, chatId, idType, id);
      const existingTimeout = toolResultTimeouts.get(key);
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        useAIFollowToolResult.setState((state) => {
          const projectEntries = state.idsByProjectConfigId[projectConfigId];
          if (!projectEntries) {
            return;
          }
          const chatEntries = projectEntries[chatId];
          if (!chatEntries) {
            return;
          }
          const storedIds = chatEntries[idType];
          if (!storedIds) {
            return;
          }
          const nextIds = storedIds.filter((entry) => entry !== id);
          if (nextIds.length > 0) {
            chatEntries[idType] = nextIds;
          } else {
            delete chatEntries[idType];
          }
          if (Object.keys(chatEntries).length === 0) {
            delete projectEntries[chatId];
          }
          if (Object.keys(projectEntries).length === 0) {
            delete state.idsByProjectConfigId[projectConfigId];
          }
        });
        toolResultTimeouts.delete(key);
      }, TOOL_RESULT_HIGHLIGHT_TIMEOUT_MS);
      toolResultTimeouts.set(key, timeoutId);
    }
  }
}
