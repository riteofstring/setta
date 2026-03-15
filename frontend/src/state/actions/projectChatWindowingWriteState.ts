import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import { replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject } from "./projectChatWindowingEmbeddedPaneVisibility";
import { reconcileProjectChatWindowingEphemeralState } from "./projectChatWindowingEphemeral";

export type ProjectChatWindowingStoreOptions = {
  syncActiveChatId?: string | undefined;
  nextGitPaneVisibleInstanceIds?: Array<string> | undefined;
};

export type ProjectChatWindowingMutationResult = {
  nextProjectChatWindowing: ProjectChatWindowingState;
  alwaysSend?: boolean;
  options?: ProjectChatWindowingStoreOptions;
};

export type ProjectChatWindowingMutation = (
  currentWindowing: ProjectChatWindowingState,
) => ProjectChatWindowingMutationResult;

export function getProjectChatWindowingStateFromStore(
  state: Pick<ZustandProjectState, "projectChatWindowing">,
): ProjectChatWindowingState {
  return state.projectChatWindowing;
}

export function canMutateProjectChatWindowingLayout(): boolean {
  const shareSession = useShareSession.getState();
  return (
    !shareSession.isDeploymentMode ||
    shareSession.sharePolicy?.allowLayoutChanges !== false
  );
}

export function applyProjectChatWindowingEphemeralState(
  projectConfigId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions,
): void {
  if (Object.hasOwn(options, "nextGitPaneVisibleInstanceIds")) {
    replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
      projectConfigId,
      options.nextGitPaneVisibleInstanceIds ?? [],
    );
  }
  reconcileProjectChatWindowingEphemeralState(
    nextProjectChatWindowing,
    projectConfigId,
  );
}

export function restoreProjectChatWindowingEphemeralState(
  projectConfigId: string,
  previousProjectChatWindowing: ProjectChatWindowingState,
  previousGitPaneVisibleInstanceIds: Array<string>,
): void {
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
    projectConfigId,
    previousGitPaneVisibleInstanceIds,
  );
  reconcileProjectChatWindowingEphemeralState(
    previousProjectChatWindowing,
    projectConfigId,
  );
}

export function applyProjectChatWindowingMutation(
  currentWindowing: ProjectChatWindowingState,
  projectConfigId: string | null,
  mutation: ProjectChatWindowingMutation,
) {
  const resolvedMutation = mutation(currentWindowing);
  const options = resolvedMutation.options ?? {};
  const shouldSyncActiveChatId = Object.hasOwn(options, "syncActiveChatId");
  if (
    projectConfigId &&
    projectConfigId !== NULL_PROJECT_CONFIG_ID &&
    resolvedMutation.nextProjectChatWindowing !== currentWindowing
  ) {
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      resolvedMutation.nextProjectChatWindowing,
      options,
    );
  }
  if (resolvedMutation.nextProjectChatWindowing !== currentWindowing) {
    useProjectState.setState((state) => {
      state.projectChatWindowing = resolvedMutation.nextProjectChatWindowing;
    });
  }
  if (shouldSyncActiveChatId) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
  return {
    nextProjectChatWindowing: resolvedMutation.nextProjectChatWindowing,
    options,
  };
}

export function applyProjectChatWindowingMutationToState(
  state: ZustandProjectState,
  projectConfigId: string,
  mutation: ProjectChatWindowingMutation,
): void {
  if (state.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const { nextProjectChatWindowing, options } = mutation(currentWindowing);
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    nextProjectChatWindowing,
    options ?? {},
  );
  state.projectChatWindowing = nextProjectChatWindowing;
  if (options && Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}
