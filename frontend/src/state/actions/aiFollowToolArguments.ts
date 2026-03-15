import { useAIFollow } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import { route_get_ai_follow_snapshot } from "utils/generatedEndpoints";
import { type AIFollowToolArgumentsUpdateContent } from "utils/generatedTypes";

type AIFollowIdsByProjectConfig = Record<
  string,
  Record<string, Record<string, Array<string>>>
>;

export type AIFollowIdsByType = Record<string, Array<string>>;

function cloneIdsByType(
  idsByType: AIFollowIdsByType | null | undefined,
): AIFollowIdsByType | null {
  if (!idsByType) {
    return null;
  }
  const entries = Object.entries(idsByType);
  if (entries.length === 0) {
    return {};
  }
  return Object.fromEntries(
    entries.map(([idType, ids]) => [idType, [...ids]]),
  ) as AIFollowIdsByType;
}

function deleteChatEntry(
  idsByProjectConfigId: AIFollowIdsByProjectConfig,
  projectConfigId: string,
  chatId: string,
): void {
  const projectEntries = idsByProjectConfigId[projectConfigId];
  if (!projectEntries) {
    return;
  }
  delete projectEntries[chatId];
  if (Object.keys(projectEntries).length === 0) {
    delete idsByProjectConfigId[projectConfigId];
  }
}

export function receiveAIFollowToolArgumentsUpdate(
  payload: AIFollowToolArgumentsUpdateContent,
): void {
  const { projectConfigId, chatId, idsByType } = payload;
  useAIFollow.setState((state) => {
    if (Object.keys(idsByType).length === 0) {
      deleteChatEntry(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        chatId,
      );
      return;
    }
    const projectEntries =
      state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
      (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
    projectEntries[chatId] = idsByType;
  });
}

export function getAIFollowToolArgumentsSnapshot(
  projectConfigId: string,
  chatId: string,
): AIFollowIdsByType | null {
  return cloneIdsByType(
    useAIFollow.getState().toolArgumentsIdsByProjectConfigId[projectConfigId]?.[
      chatId
    ] ?? null,
  );
}

export function clearAIFollowToolArgumentsForChat(
  projectConfigId: string,
  chatId: string,
): void {
  useAIFollow.setState((state) => {
    deleteChatEntry(
      state.toolArgumentsIdsByProjectConfigId,
      projectConfigId,
      chatId,
    );
  });
}

export function restoreAIFollowToolArgumentsSnapshot({
  projectConfigId,
  chatId,
  idsByType,
}: {
  projectConfigId: string;
  chatId: string;
  idsByType: AIFollowIdsByType | null;
}): void {
  const nextIdsByType = cloneIdsByType(idsByType);
  useAIFollow.setState((state) => {
    if (nextIdsByType === null) {
      deleteChatEntry(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        chatId,
      );
      return;
    }
    const projectEntries =
      state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
      (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
    projectEntries[chatId] = nextIdsByType;
  });
}

export async function requestAIFollowSnapshot(
  projectConfigId: string,
): Promise<void> {
  const res = await route_get_ai_follow_snapshot({ projectConfigId });
  if (!res200(res)) {
    return;
  }
  const snapshot: AIFollowToolArgumentsUpdateContent[] = res.data;
  if (snapshot.length === 0) {
    return;
  }
  for (const entry of snapshot) {
    receiveAIFollowToolArgumentsUpdate(entry);
  }
}
