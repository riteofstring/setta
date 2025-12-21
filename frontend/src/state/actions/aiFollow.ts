import { useAIFollow } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_get_ai_follow_snapshot } from "utils/generatedEndpoints";
import { AIFollowUpdateContent } from "utils/generatedTypes";

export function receiveAIFollowUpdate(payload: AIFollowUpdateContent): void {
  const { projectConfigId, chatId, sectionIds } = payload;
  useAIFollow.setState((state) => {
    if (!state.sectionIdsByProjectConfigId[projectConfigId]) {
      state.sectionIdsByProjectConfigId[projectConfigId] = {};
    }
    state.sectionIdsByProjectConfigId[projectConfigId][chatId] = sectionIds;
  });
}

export async function requestAIFollowSnapshot(
  projectConfigId: string,
): Promise<void> {
  const res = await route_get_ai_follow_snapshot({ projectConfigId });
  if (!res200(res)) {
    return;
  }
  const snapshot: AIFollowUpdateContent[] = res.data;
  if (snapshot.length === 0) {
    return;
  }
  for (const entry of snapshot) {
    receiveAIFollowUpdate(entry);
  }
}
