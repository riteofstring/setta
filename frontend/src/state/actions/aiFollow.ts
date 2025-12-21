import { useAIFollow } from "state/definitions";
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
