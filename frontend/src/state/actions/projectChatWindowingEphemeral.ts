import { type ProjectChatWindowingState } from "utils/generatedTypes";
import {
  clearProjectChatGitGraphEmbeddedPaneVisibilityForOtherProjects,
  getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject,
  isProjectChatGitGraphEmbeddedPaneVisible,
  isProjectChatGitGraphEmbeddedPaneVisibleInState,
  reconcileProjectChatGitGraphEmbeddedPaneVisibility,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
  toggleProjectChatGitGraphEmbeddedPaneVisibility,
} from "./projectChatWindowingEmbeddedPaneVisibility";
import {
  buildProjectChatEphemeralWindowInstanceKey,
  parseProjectChatEphemeralWindowInstanceKey,
} from "./projectChatWindowingEphemeralKeys";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
} from "./projectChatWindowingTrackedGitPaneState";

export {
  buildProjectChatEphemeralWindowInstanceKey,
  clearProjectChatGitGraphEmbeddedPaneVisibilityForOtherProjects,
  clearTrackedGitPaneGraphWindowIfMatches,
  getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject,
  getTrackedGitPaneGraphWindowInstanceIdForProject,
  isProjectChatGitGraphEmbeddedPaneVisible,
  isProjectChatGitGraphEmbeddedPaneVisibleInState,
  parseProjectChatEphemeralWindowInstanceKey,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
  resolveTrackedGitPaneGraphWindowInstanceId,
  setTrackedGitPaneGraphWindowInstanceId,
  toggleProjectChatGitGraphEmbeddedPaneVisibility,
};

export function reconcileProjectChatWindowingEphemeralState(
  nextProjectChatWindowing: ProjectChatWindowingState,
  projectConfigId: string,
): void {
  resolveTrackedGitPaneGraphWindowInstanceId(
    nextProjectChatWindowing,
    projectConfigId,
  );
  reconcileProjectChatGitGraphEmbeddedPaneVisibility(
    projectConfigId,
    nextProjectChatWindowing,
  );
}
