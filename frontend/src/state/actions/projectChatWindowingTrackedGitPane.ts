import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";
import { addProjectChatWindowInstanceInState } from "./projectChatWindowingInstanceCreation";
import { setProjectChatWindowTitleInState } from "./projectChatWindowingMetadataState";
import {
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  reopenProjectChatWindowInState,
} from "./projectChatWindowingPlacementState";
import {
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "./projectChatWindowingTrackedGitPaneState";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";

export function ensureTrackedGitPaneGraphWindow({
  title = "Git Graph",
  nowMs = Date.now(),
}: {
  title?: string | null;
  nowMs?: number;
} = {}): string {
  if (!canMutateProjectChatWindowingLayout()) {
    return "";
  }
  const normalizedTitle = title?.trim() ? title.trim() : "Git Graph";
  const state = useProjectState.getState();
  const projectConfigId = state.projectConfig.id;
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const trackedInstanceId = resolveTrackedGitPaneGraphWindowInstanceId(
    currentWindowing,
    projectConfigId,
  );

  if (trackedInstanceId) {
    dispatchProjectChatWindowingMutation((latestWindowing) => {
      let next = reopenProjectChatWindowInState(
        latestWindowing,
        trackedInstanceId,
      );
      next = setProjectChatWindowTitleInState(
        next,
        trackedInstanceId,
        normalizedTitle,
      );
      next = maximizeProjectChatWindowInState(next, trackedInstanceId);
      return {
        nextProjectChatWindowing: focusProjectChatWindowInState(
          next,
          trackedInstanceId,
          nowMs,
        ),
      };
    });
    return trackedInstanceId;
  }

  const created = addProjectChatWindowInstanceInState(currentWindowing, {
    placement: ChatWindowPlacementEnum.floating,
    mode: ChatWindowModeEnum.git_graph_mode,
    title: normalizedTitle,
    nowMs,
  });
  dispatchProjectChatWindowingMutation((latestWindowing) => {
    const nextCreated = addProjectChatWindowInstanceInState(latestWindowing, {
      instanceId: created.instanceId,
      placement: ChatWindowPlacementEnum.floating,
      mode: ChatWindowModeEnum.git_graph_mode,
      title: normalizedTitle,
      nowMs,
    });
    let next = maximizeProjectChatWindowInState(
      nextCreated.state,
      nextCreated.instanceId,
    );
    next = focusProjectChatWindowInState(next, nextCreated.instanceId, nowMs);
    return {
      nextProjectChatWindowing: next,
    };
  });
  setTrackedGitPaneGraphWindowInstanceId(projectConfigId, created.instanceId);
  return created.instanceId;
}
