import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject } from "./projectChatWindowingEphemeral";
import {
  enqueueSerializedProjectChatWindowingWrite,
  primeAuthoritativeProjectChatWindowingState,
  sendProjectChatWindowingSnapshot,
  type ProjectChatWindowingSend,
} from "./projectChatWindowingWritePipeline";
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

export { flushPendingProjectChatWindowingWrites } from "./projectChatWindowingWritePipeline";
export {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";
export type { ProjectChatWindowingStoreOptions } from "./projectChatWindowingWriteState";

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

export async function syncProjectChatWindowingState() {
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    currentWindowing,
  );
  const opId = createNewId();
  return enqueueSerializedProjectChatWindowingWrite(projectConfigId, opId, {
    alwaysSend: true,
    mutation: (latestWindowing) => ({
      nextProjectChatWindowing: latestWindowing,
      alwaysSend: true,
    }),
    opId,
    send: sendProjectChatWindowingSnapshot as ProjectChatWindowingSend,
  });
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
