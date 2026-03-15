import { useProjectState } from "state/definitions";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import { getAuthoritativeProjectChatWindowingState } from "./projectChatWindowingAuthoritative";
import { type ProjectChatWindowingSend } from "./projectChatWindowingWritePublish";
import { type ProjectChatWindowingMutation } from "./projectChatWindowingWriteState";

export type PendingProjectChatWindowingMutation = {
  alwaysSend: boolean;
  mutation: ProjectChatWindowingMutation;
  opId: string;
  send: ProjectChatWindowingSend;
};

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

export function getPendingProjectChatWindowingMutations(
  projectConfigId: string,
): Array<PendingProjectChatWindowingMutation> {
  return (
    pendingProjectChatWindowingMutationsByProjectId.get(projectConfigId) ?? []
  );
}

export function hasPendingProjectChatWindowingMutations(
  projectConfigId: string,
): boolean {
  return getPendingProjectChatWindowingMutations(projectConfigId).length > 0;
}

export function queuePendingProjectChatWindowingMutation(
  projectConfigId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): void {
  pendingProjectChatWindowingMutationsByProjectId.set(projectConfigId, [
    ...getPendingProjectChatWindowingMutations(projectConfigId),
    pendingMutation,
  ]);
}

export function dequeuePendingProjectChatWindowingMutation(
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

export function findPendingProjectChatWindowingMutation(
  projectConfigId: string,
  opId: string,
): PendingProjectChatWindowingMutation | null {
  return (
    getPendingProjectChatWindowingMutations(projectConfigId).find(
      (candidate) => candidate.opId === opId,
    ) ?? null
  );
}

export function buildProjectChatWindowingSnapshotForMutation(
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

export function getPendingProjectChatWindowingReplayMutations(
  projectConfigId: string,
  acknowledgedOpId: string,
): Array<ProjectChatWindowingMutation> {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const acknowledgedMutationIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === acknowledgedOpId,
  );
  if (acknowledgedMutationIndex < 0) {
    return pendingMutations.map((pendingMutation) => pendingMutation.mutation);
  }
  return pendingMutations
    .slice(acknowledgedMutationIndex + 1)
    .map((pendingMutation) => pendingMutation.mutation);
}

export function getProjectChatWindowingWriteBarrier(
  projectConfigId: string,
): Promise<void> | null {
  return (
    projectChatWindowingWriteBarrierByProjectId.get(projectConfigId) ?? null
  );
}

export function setProjectChatWindowingWriteBarrier(
  projectConfigId: string,
  barrier: Promise<void>,
): void {
  projectChatWindowingWriteBarrierByProjectId.set(projectConfigId, barrier);
}

export function createProjectChatWindowingWriteBarrier(
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

export function trackProjectChatWindowingWrite<T extends Promise<unknown>>(
  request: T,
): T {
  pendingProjectChatWindowingWrites.add(request);
  void request.finally(() => {
    pendingProjectChatWindowingWrites.delete(request);
  });
  return request;
}

export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
  }
}
