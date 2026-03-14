import { replaceProjectChatWindowingState } from "state/actions/projectChatWindowingWrites";
import { useProjectState } from "state/definitions";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { addTemporaryNotification } from "./notifications";
import {
  canMutateWindowSpaceLayout,
  getProjectWindowSpaces,
} from "./windowSpacePersistence";
import {
  buildWorkspaceRestoreThreadState,
  getBlockedWindowSpaceRestoreMessage,
  restoreWorkspaceProjectChatThreadBindings,
} from "./windowSpaceProjectChatThreadRestore";
import { buildWorkspaceRestorePlan } from "./windowSpaceWorkspaceRestorePlan";

export async function restoreWindowSpaceInWorkspace(
  windowSpaceId: string,
): Promise<void> {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const windowSpaces = getProjectWindowSpaces(state.projectConfig);
  if (!(windowSpaceId in windowSpaces)) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  const windowSpace = windowSpaces[windowSpaceId];
  if (!windowSpace) {
    throw new Error(`Window space ${windowSpaceId} not found.`);
  }
  const { nextWindowing, nextGitPaneVisibleInstanceIds } =
    buildWorkspaceRestorePlan(windowSpace, state);
  const { layoutWindowing, threadBindings } = buildWorkspaceRestoreThreadState(
    state.projectChatWindowing,
    nextWindowing,
  );
  const blockedRestoreMessage =
    getBlockedWindowSpaceRestoreMessage(threadBindings);
  if (blockedRestoreMessage) {
    addTemporaryNotification(
      blockedRestoreMessage,
      SettaNotificationTypeEnum.error,
    );
    return;
  }
  replaceProjectChatWindowingState(layoutWindowing, {
    nextGitPaneVisibleInstanceIds,
  });
  try {
    await restoreWorkspaceProjectChatThreadBindings(
      state.projectConfig.id,
      threadBindings,
    );
  } catch (error) {
    console.error("Failed to restore saved project chat threads.", {
      projectConfigId: state.projectConfig.id,
      windowSpaceId,
      error,
    });
    addTemporaryNotification(
      "Failed to restore saved chat threads.",
      SettaNotificationTypeEnum.error,
    );
  }
}
