import { useMisc } from "state/stores/layoutInteractionStores";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  buildProjectChatEphemeralWindowInstanceKey,
  parseProjectChatEphemeralWindowInstanceKey,
} from "./projectChatWindowingEphemeralKeys";

function getTrackedGitPaneGraphWindowKeyFromMisc(): string | null {
  return (
    useMisc.getState().projectChatTrackedGitPaneGraphWindowInstanceId ?? null
  );
}

function clearTrackedGitPaneGraphWindowInstanceId(): void {
  useMisc.setState({
    projectChatTrackedGitPaneGraphWindowInstanceId: null,
  });
}

export function setTrackedGitPaneGraphWindowInstanceId(
  projectConfigId: string,
  instanceId: string | null,
): void {
  useMisc.setState({
    projectChatTrackedGitPaneGraphWindowInstanceId:
      instanceId === null
        ? null
        : buildProjectChatEphemeralWindowInstanceKey(
            projectConfigId,
            instanceId,
          ),
  });
}

export function clearTrackedGitPaneGraphWindowIfMatches(
  projectConfigId: string,
  instanceId: string,
): void {
  if (
    getTrackedGitPaneGraphWindowKeyFromMisc() !==
    buildProjectChatEphemeralWindowInstanceKey(projectConfigId, instanceId)
  ) {
    return;
  }
  clearTrackedGitPaneGraphWindowInstanceId();
}

export function getTrackedGitPaneGraphWindowInstanceIdForProject(
  projectConfigId: string,
): string | null {
  const parsedKey = parseProjectChatEphemeralWindowInstanceKey(
    getTrackedGitPaneGraphWindowKeyFromMisc(),
  );
  if (!parsedKey || parsedKey.projectConfigId !== projectConfigId) {
    return null;
  }
  return parsedKey.instanceId;
}

export function resolveTrackedGitPaneGraphWindowInstanceId(
  state: ProjectChatWindowingState,
  projectConfigId: string,
): string | null {
  const trackedInstanceId =
    getTrackedGitPaneGraphWindowInstanceIdForProject(projectConfigId);
  if (!trackedInstanceId) {
    if (getTrackedGitPaneGraphWindowKeyFromMisc() !== null) {
      clearTrackedGitPaneGraphWindowInstanceId();
    }
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
    clearTrackedGitPaneGraphWindowInstanceId();
    return null;
  }
  return trackedInstanceId;
}
