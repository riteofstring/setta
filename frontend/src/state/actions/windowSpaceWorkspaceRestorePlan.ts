import type {
  ProjectChatWindowingState,
  WindowSpaceConfig,
} from "utils/generatedTypes";
import {
  buildWorkspaceRestoreWindowingPlan,
  type WorkspaceRestoreSourceState,
} from "./windowSpaceWorkspaceRestoreLayout";
import { buildWorkspaceRestoreGitPaneVisibleInstanceIds } from "./windowSpaceWorkspaceRestoreVisibility";

export type { WorkspaceRestoreSourceState } from "./windowSpaceWorkspaceRestoreLayout";

export function buildWorkspaceRestorePlan(
  windowSpace: WindowSpaceConfig,
  state: WorkspaceRestoreSourceState,
): {
  nextWindowing: ProjectChatWindowingState;
  nextGitPaneVisibleInstanceIds: Array<string>;
} {
  const { nextWindowing, restoredWindowing, remappedInstanceIdByOriginalId } =
    buildWorkspaceRestoreWindowingPlan(windowSpace, state);

  return {
    nextWindowing,
    nextGitPaneVisibleInstanceIds:
      buildWorkspaceRestoreGitPaneVisibleInstanceIds({
        windowSpace,
        projectConfigId: state.projectConfig.id,
        nextWindowing,
        restoredWindowing,
        remappedInstanceIdByOriginalId,
      }),
  };
}
