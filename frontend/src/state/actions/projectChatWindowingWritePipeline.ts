import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_project_chat_windowing_state } from "utils/generatedEndpoints";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import {
  getAuthoritativeProjectChatWindowingState,
  recordAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";
import {
  applyProjectChatWindowingEphemeralState,
  applyProjectChatWindowingMutationToState,
  type ProjectChatWindowingMutation,
} from "./projectChatWindowingWriteState";

export type ProjectChatWindowingSend = (
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
) => Promise<ProjectChatWindowingTrackedResponse>;

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

export type ProjectChatWindowingTrackedResponse =
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

function getPendingProjectChatWindowingMutations(
  projectConfigId: string,
): Array<PendingProjectChatWindowingMutation> {
  return (
    pendingProjectChatWindowingMutationsByProjectId.get(projectConfigId) ?? []
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

export function primeAuthoritativeProjectChatWindowingState(
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

export function sendProjectChatWindowingSnapshot(
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

export function enqueueSerializedProjectChatWindowingWrite(
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

export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
  }
}
