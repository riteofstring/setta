import { isProjectChatGitGraphEmbeddedPaneVisible } from "state/actions/projectChatWindowingEphemeral";
import {
  ChatWindowModeEnum,
  WindowSpaceSurfaceKindEnum,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
} from "utils/generatedTypes";

type WorkspaceRestoreGitPaneVisibleInstanceIdsArgs = {
  windowSpace: WindowSpaceConfig;
  projectConfigId: string;
  nextWindowing: ProjectChatWindowingState;
  restoredWindowing: ProjectChatWindowingState;
  remappedInstanceIdByOriginalId: Record<string, string>;
};

function buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
  windowSpace: WindowSpaceConfig,
  remappedInstanceIdByOriginalId: Record<string, string>,
  restoredWindowing: ProjectChatWindowingState,
): Set<string> {
  const visibleInstanceIds = new Set<string>();
  for (const [instanceId, window] of Object.entries(windowSpace.windowsById)) {
    if (
      window.surfaceKind !== WindowSpaceSurfaceKindEnum.project_chat ||
      window.mode !== ChatWindowModeEnum.git_graph_mode ||
      !window.embeddedGitPaneVisible
    ) {
      continue;
    }
    const remappedInstanceId = remappedInstanceIdByOriginalId[instanceId];
    if (
      remappedInstanceId &&
      restoredWindowing.instancesById[remappedInstanceId]
    ) {
      visibleInstanceIds.add(remappedInstanceId);
    }
  }
  return visibleInstanceIds;
}

export function buildWorkspaceRestoreGitPaneVisibleInstanceIds({
  windowSpace,
  projectConfigId,
  nextWindowing,
  restoredWindowing,
  remappedInstanceIdByOriginalId,
}: WorkspaceRestoreGitPaneVisibleInstanceIdsArgs): Array<string> {
  const restoredGitPaneVisibleInstanceIds =
    buildRestoredGitGraphEmbeddedPaneVisibleInstanceIds(
      windowSpace,
      remappedInstanceIdByOriginalId,
      restoredWindowing,
    );
  const restoredInstanceIds = new Set(
    Object.keys(restoredWindowing.instancesById),
  );
  const nextGitPaneVisibleInstanceIds: Array<string> = [];

  for (const instance of Object.values(nextWindowing.instancesById)) {
    if (
      instance.mode !== ChatWindowModeEnum.git_graph_mode ||
      instance.isClosed
    ) {
      continue;
    }
    if (restoredInstanceIds.has(instance.instanceId)) {
      if (restoredGitPaneVisibleInstanceIds.has(instance.instanceId)) {
        nextGitPaneVisibleInstanceIds.push(instance.instanceId);
      }
      continue;
    }
    if (
      isProjectChatGitGraphEmbeddedPaneVisible(
        projectConfigId,
        instance.instanceId,
      )
    ) {
      nextGitPaneVisibleInstanceIds.push(instance.instanceId);
    }
  }

  return nextGitPaneVisibleInstanceIds;
}
