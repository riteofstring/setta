import { useMisc } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

function getTrackedGitPaneGraphWindowInstanceIdFromMisc(): string | null {
  return (
    useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId ?? null
  );
}

export function setTrackedGitPaneGraphWindowInstanceId(
  instanceId: string | null,
): void {
  useMisc.setState({
    projectChatTrackedGitPaneGraphWindowInstanceId: instanceId,
  });
}

function clearTrackedGitPaneGraphWindowInstanceIdIfMatches(
  instanceId: string,
): void {
  if (getTrackedGitPaneGraphWindowInstanceIdFromMisc() !== instanceId) {
    return;
  }
  setTrackedGitPaneGraphWindowInstanceId(null);
}

export function clearTrackedGitPaneGraphWindowIfMatches(
  instanceId: string,
): void {
  clearTrackedGitPaneGraphWindowInstanceIdIfMatches(instanceId);
}

function pruneProjectChatGitGraphEmbeddedPaneVisibility(
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  useMisc.setState((state) => {
    const visibilityByInstanceId =
      state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId;
    const nextVisibilityByInstanceId: Record<string, true> = {};
    let changed = false;

    for (const instanceId of Object.keys(visibilityByInstanceId)) {
      const instance = nextProjectChatWindowing.instancesById[instanceId];
      if (
        !instance ||
        instance.mode !== ChatWindowModeEnum.git_graph_mode ||
        instance.isClosed
      ) {
        changed = true;
        continue;
      }
      nextVisibilityByInstanceId[instanceId] = true;
    }

    if (
      !changed &&
      Object.keys(nextVisibilityByInstanceId).length ===
        Object.keys(visibilityByInstanceId).length
    ) {
      return state;
    }

    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId:
        nextVisibilityByInstanceId,
    };
  });
}

export function resetProjectChatGitGraphEmbeddedPaneVisibility(): void {
  useMisc.setState((state) => {
    if (
      Object.keys(state.projectChatGitGraphEmbeddedPaneVisibleByInstanceId)
        .length === 0
    ) {
      return state;
    }
    return {
      ...state,
      projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {},
    };
  });
}

export function resolveTrackedGitPaneGraphWindowInstanceId(
  state: ProjectChatWindowingState,
): string | null {
  const trackedInstanceId = getTrackedGitPaneGraphWindowInstanceIdFromMisc();
  if (!trackedInstanceId) {
    return null;
  }
  const instance = state.instancesById[trackedInstanceId];
  if (
    !instance ||
    instance.mode !== ChatWindowModeEnum.git_graph_mode ||
    instance.placement !== ChatWindowPlacementEnum.maximized ||
    instance.isClosed ||
    instance.isMinimized
  ) {
    setTrackedGitPaneGraphWindowInstanceId(null);
    return null;
  }
  return trackedInstanceId;
}

export function reconcileProjectChatWindowingEphemeralState(
  nextProjectChatWindowing: ProjectChatWindowingState,
): void {
  resolveTrackedGitPaneGraphWindowInstanceId(nextProjectChatWindowing);
  pruneProjectChatGitGraphEmbeddedPaneVisibility(nextProjectChatWindowing);
}
