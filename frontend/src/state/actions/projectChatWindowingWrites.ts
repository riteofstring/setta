import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { useAIStore } from "state/stores/aiStores";
import { res200 } from "utils/endpointUtils";
import { route_set_project_chat_windowing_state } from "utils/generatedEndpoints";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  getAuthoritativeProjectChatWindowingState,
  recordAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";
import {
  getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject,
  reconcileProjectChatWindowingEphemeralState,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
} from "./projectChatWindowingEphemeral";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionInfos";

export type ProjectChatWindowingStoreOptions = {
  syncActiveChatId?: string | undefined;
  nextGitPaneVisibleInstanceIds?: Array<string> | undefined;
};

type ProjectChatWindowingSend = (
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
) => Promise<ProjectChatWindowingTrackedResponse>;

type ProjectChatWindowingMutationResult = {
  nextProjectChatWindowing: ProjectChatWindowingState;
  alwaysSend?: boolean;
  options?: ProjectChatWindowingStoreOptions;
  send?: ProjectChatWindowingSend;
};

export type ProjectChatWindowingMutation = (
  currentWindowing: ProjectChatWindowingState,
) => ProjectChatWindowingMutationResult;

type PendingProjectChatWindowingMutation = {
  alwaysSend: boolean;
  mutation: ProjectChatWindowingMutation;
  opId: string;
  send: ProjectChatWindowingSend;
};

type ProjectChatWindowingWriteResponse = Awaited<
  ReturnType<typeof route_set_project_chat_windowing_state>
>;

type SyntheticProjectChatWindowingWriteResponse = {
  data: ProjectChatWindowingState;
  hasResponse: true;
  status: 200;
};

type ProjectChatWindowingTrackedResponse =
  | ProjectChatWindowingWriteResponse
  | SyntheticProjectChatWindowingWriteResponse;

type ProjectChatWindowingSnapshotForMutation = {
  authoritativeWindowing: ProjectChatWindowingState;
  nextProjectChatWindowing: ProjectChatWindowingState;
};

const pendingProjectChatWindowingWrites = new Set<Promise<unknown>>();
const pendingProjectChatWindowingMutationsByProjectId = new Map<
  string,
  Array<PendingProjectChatWindowingMutation>
>();
const projectChatWindowingWriteBarrierByProjectId = new Map<
  string,
  Promise<void>
>();

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

function getPendingProjectChatWindowingMutations(
  projectConfigId: string,
): Array<PendingProjectChatWindowingMutation> {
  return (
    pendingProjectChatWindowingMutationsByProjectId.get(projectConfigId) ?? []
  );
}

function applyProjectChatWindowingEphemeralState(
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

function restoreProjectChatWindowingEphemeralState(
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

function enqueueProjectChatWindowingWrite<T extends Promise<unknown>>(
  request: T,
): T {
  pendingProjectChatWindowingWrites.add(request);
  void request.finally(() => {
    pendingProjectChatWindowingWrites.delete(request);
  });
  return request;
}

function primeAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  projectChatWindowing: ProjectChatWindowingState,
): void {
  if (getPendingProjectChatWindowingMutations(projectConfigId).length > 0) {
    return;
  }
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    projectChatWindowing,
  );
}

function addPendingProjectChatWindowingMutation(
  projectConfigId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): void {
  pendingProjectChatWindowingMutationsByProjectId.set(projectConfigId, [
    ...getPendingProjectChatWindowingMutations(projectConfigId),
    pendingMutation,
  ]);
}

function removePendingProjectChatWindowingMutation(
  projectConfigId: string,
  opId: string,
): void {
  const remainingMutations = getPendingProjectChatWindowingMutations(
    projectConfigId,
  ).filter((pendingMutation) => pendingMutation.opId !== opId);
  if (remainingMutations.length === 0) {
    pendingProjectChatWindowingMutationsByProjectId.delete(projectConfigId);
    projectChatWindowingWriteBarrierByProjectId.delete(projectConfigId);
    return;
  }
  pendingProjectChatWindowingMutationsByProjectId.set(
    projectConfigId,
    remainingMutations,
  );
}

function buildProjectChatWindowingSnapshotForMutation(
  projectConfigId: string,
  opId: string,
): ProjectChatWindowingSnapshotForMutation | null {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const targetIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (targetIndex < 0) {
    return null;
  }
  const authoritativeWindowing =
    getAuthoritativeProjectChatWindowingState(projectConfigId) ??
    useProjectState.getState().projectChatWindowing;
  let nextProjectChatWindowing = authoritativeWindowing;
  for (let index = 0; index <= targetIndex; index += 1) {
    const pendingMutation = pendingMutations[index];
    if (!pendingMutation) {
      continue;
    }
    nextProjectChatWindowing = pendingMutation.mutation(
      nextProjectChatWindowing,
    ).nextProjectChatWindowing;
  }
  return {
    authoritativeWindowing,
    nextProjectChatWindowing,
  };
}

function getPendingProjectChatWindowingMutationsAfter(
  projectConfigId: string,
  opId: string,
): Array<PendingProjectChatWindowingMutation> {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const acknowledgedMutationIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (acknowledgedMutationIndex < 0) {
    return pendingMutations;
  }
  return pendingMutations.slice(acknowledgedMutationIndex + 1);
}

function publishAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  acknowledgedOpId: string,
  authoritativeWindowing: ProjectChatWindowingState,
): void {
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    authoritativeWindowing,
  );
  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }

  const pendingMutations = getPendingProjectChatWindowingMutationsAfter(
    projectConfigId,
    acknowledgedOpId,
  );
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    authoritativeWindowing,
    {},
  );
  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectChatWindowing = authoritativeWindowing;
    for (const pendingMutation of pendingMutations) {
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        pendingMutation.mutation,
      );
    }
  });
}

function sendProjectChatWindowingSnapshot(
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): Promise<ProjectChatWindowingWriteResponse> {
  return route_set_project_chat_windowing_state({
    projectConfigId,
    state: nextProjectChatWindowing,
    frontendOpId,
  });
}

function buildSyntheticProjectChatWindowingWriteResponse(
  projectConfigId: string,
): SyntheticProjectChatWindowingWriteResponse {
  return {
    data:
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing,
    status: 200,
    hasResponse: true,
  };
}

function createProjectChatWindowingWriteBarrier(
  request: Promise<unknown>,
): Promise<void> {
  return request
    .finally(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        }),
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

function enqueueSerializedProjectChatWindowingWrite(
  projectConfigId: string,
  opId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): Promise<ProjectChatWindowingTrackedResponse> {
  addPendingProjectChatWindowingMutation(projectConfigId, pendingMutation);
  const previousBarrier =
    projectChatWindowingWriteBarrierByProjectId.get(projectConfigId) ??
    Promise.resolve();
  const request = previousBarrier.then(async () => {
    const pendingMutations =
      getPendingProjectChatWindowingMutations(projectConfigId);
    const targetMutation = pendingMutations.find(
      (candidate) => candidate.opId === opId,
    );
    const snapshot = buildProjectChatWindowingSnapshotForMutation(
      projectConfigId,
      opId,
    );
    if (!snapshot || !targetMutation) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const { authoritativeWindowing, nextProjectChatWindowing } = snapshot;
    if (
      !targetMutation.alwaysSend &&
      nextProjectChatWindowing === authoritativeWindowing
    ) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const response = await targetMutation.send(
      projectConfigId,
      opId,
      nextProjectChatWindowing,
    );
    if (res200(response)) {
      publishAuthoritativeProjectChatWindowingState(
        projectConfigId,
        opId,
        response.data,
      );
    }
    return response;
  });
  const barrier = createProjectChatWindowingWriteBarrier(
    request.finally(() => {
      removePendingProjectChatWindowingMutation(projectConfigId, opId);
    }),
  );
  projectChatWindowingWriteBarrierByProjectId.set(projectConfigId, barrier);
  return enqueueProjectChatWindowingWrite(request);
}

function applyProjectChatWindowingMutation(
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

function applyProjectChatWindowingMutationToState(
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
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      nextProjectChatWindowing,
      options,
    );
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

export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
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
    send: sendProjectChatWindowingSnapshot,
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
