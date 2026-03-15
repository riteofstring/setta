import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import { getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject } from "./projectChatWindowingEphemeral";
import { enqueueSerializedProjectChatWindowingWrite } from "./projectChatWindowingWritePipeline";
import {
  primeAuthoritativeProjectChatWindowingState,
  sendProjectChatWindowingSnapshot,
} from "./projectChatWindowingWritePublish";
import { hasPendingProjectChatWindowingMutations } from "./projectChatWindowingWriteQueue";
import {
  applyProjectChatWindowingMutation,
  applyProjectChatWindowingMutationToState,
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
  restoreProjectChatWindowingEphemeralState,
  type ProjectChatWindowingMutation,
  type ProjectChatWindowingStoreOptions,
} from "./projectChatWindowingWriteState";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionInfos";

export {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";
export type { ProjectChatWindowingStoreOptions } from "./projectChatWindowingWriteState";
export {
  flushPendingProjectChatWindowingWrites,
  syncProjectChatWindowingState,
} from "./projectChatWindowingWriteSync";

export function dispatchProjectChatWindowingMutation(
  mutation: ProjectChatWindowingMutation,
): void {
  const projectConfigId = getCurrProjectConfigId();
  const currentProjectState = useProjectState.getState();
  const previousProjectChatWindowing = currentProjectState.projectChatWindowing;
  const previousActiveChatId = useAIStore.getState().activeChatId;
  const {
    nextProjectChatWindowing,
    alwaysSend = false,
    options: initialOptions,
    send = sendProjectChatWindowingSnapshot,
  } = mutation(getProjectChatWindowingStateFromStore(currentProjectState));
  const previousGitPaneVisibleInstanceIds =
    !projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID
      ? []
      : getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject(
          projectConfigId,
        );
  if (
    !alwaysSend &&
    nextProjectChatWindowing === previousProjectChatWindowing
  ) {
    return;
  }
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingMutation(
      getProjectChatWindowingStateFromStore(currentProjectState),
      null,
      mutation,
    );
    return;
  }
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    hasPendingProjectChatWindowingMutations(projectConfigId),
    previousProjectChatWindowing,
  );

  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    reapply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    rollback: (state) => {
      restoreProjectChatWindowingEphemeralState(
        projectConfigId,
        previousProjectChatWindowing,
        previousGitPaneVisibleInstanceIds,
      );
      state.projectChatWindowing = previousProjectChatWindowing;
      if (initialOptions && Object.hasOwn(initialOptions, "syncActiveChatId")) {
        useAIStore.setState({
          activeChatId: previousActiveChatId,
        });
      }
    },
    send: (frontendOpId) =>
      enqueueSerializedProjectChatWindowingWrite(
        projectConfigId,
        frontendOpId,
        {
          alwaysSend,
          mutation,
          opId: frontendOpId,
          send,
        },
      ),
  });
}

export function applyProjectChatWindowingMutationLocally(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId && projectConfigId !== NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingMutation(
      currentWindowing,
      projectConfigId,
      () => ({
        nextProjectChatWindowing,
        options,
      }),
    );
    return;
  }
  useProjectState.setState((state) => {
    state.projectChatWindowing = nextProjectChatWindowing;
  });
  if (Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}

export function replaceProjectChatWindowingState(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation(() => ({
    nextProjectChatWindowing,
    options,
  }));
}
