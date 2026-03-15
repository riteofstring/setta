import {
  PendingOperation,
  usePendingOperations,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { type ResponseDataAndStatus, res200 } from "utils/endpointUtils";
import { createNewId } from "utils/idNameCreation";

export function addPendingProjectStateOperation(
  apply: (state: ZustandProjectState) => void,
): string {
  const opId = createNewId();
  usePendingOperations.setState((state) => ({
    pending: [...state.pending, { apply, opId, acknowledged: false }],
  }));
  return opId;
}

export function acknowledgePendingProjectStateOperation(opId: string) {
  // Mark as acknowledged so stale optimistic ops don't override later backend syncs.
  usePendingOperations.setState((state) => {
    const index = state.pending.findIndex((opInfo) => opInfo.opId === opId);
    if (index < 0 || state.pending[index].acknowledged) {
      return state;
    }
    const nextPending = [...state.pending];
    nextPending[index] = {
      ...nextPending[index],
      acknowledged: true,
    };
    return { pending: nextPending };
  });
}

export function removePendingProjectStateOperation(opId: string) {
  usePendingOperations.setState((state) => ({
    pending: state.pending.filter((opInfo) => opInfo.opId !== opId),
  }));
}

function removePendingProjectStateOperationAndGetReplayOps(
  opId: string,
): Array<PendingOperation> {
  const pendingBeforeRemoval = usePendingOperations.getState().pending;
  const failedOpIndex = pendingBeforeRemoval.findIndex(
    (opInfo) => opInfo.opId === opId,
  );
  removePendingProjectStateOperation(opId);
  if (failedOpIndex < 0) {
    return [];
  }
  const remainingOpIds = new Set(
    usePendingOperations.getState().pending.map((opInfo) => opInfo.opId),
  );
  return pendingBeforeRemoval
    .slice(failedOpIndex + 1)
    .filter((opInfo) => remainingOpIds.has(opInfo.opId));
}

function rollbackOptimisticProjectStateUpdate(
  opId: string,
  rollback?: (state: ZustandProjectState) => void,
) {
  const replayOps = removePendingProjectStateOperationAndGetReplayOps(opId);
  if (!rollback) {
    return;
  }
  useProjectState.setState((state) => {
    rollback(state);
    for (const opInfo of replayOps) {
      opInfo.apply(state);
    }
  });
}

function applyOptimisticProjectStateUpdateIfProjectMatches(
  state: ZustandProjectState,
  projectConfigId: string | undefined,
  update: (state: ZustandProjectState) => void,
) {
  if (
    projectConfigId !== undefined &&
    state.projectConfig.id !== projectConfigId
  ) {
    return;
  }
  update(state);
}

export function isResponseDataAndStatus(
  value: unknown,
): value is ResponseDataAndStatus<unknown> {
  // Narrow unknown send results without relying on try/catch for control flow.
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "hasResponse" in value
  );
}

export function dispatchOptimisticProjectStateUpdate({
  apply,
  send,
  rollback,
  reapply,
  projectConfigId,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => void | Promise<unknown>;
  rollback?: (state: ZustandProjectState) => void;
  reapply?: (state: ZustandProjectState) => void;
  projectConfigId?: string;
}) {
  const applyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      apply,
    );
  const reapplyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      reapply ?? apply,
    );
  const rollbackWithProjectGuard =
    rollback === undefined
      ? undefined
      : (state: ZustandProjectState) =>
          applyOptimisticProjectStateUpdateIfProjectMatches(
            state,
            projectConfigId,
            rollback,
          );

  useProjectState.setState(applyWithProjectGuard);
  const opId = addPendingProjectStateOperation(reapplyWithProjectGuard);
  const result = send(opId);
  if (result instanceof Promise) {
    void result
      .then((res) => {
        // A 200 response means the backend accepted the op; don't keep reapplying it.
        if (isResponseDataAndStatus(res) && res200(res)) {
          if (
            projectConfigId !== undefined &&
            useProjectState.getState().projectConfig.id !== projectConfigId
          ) {
            removePendingProjectStateOperation(opId);
            return;
          }
          acknowledgePendingProjectStateOperation(opId);
        } else if (isResponseDataAndStatus(res)) {
          rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
        }
      })
      .catch(() => {
        rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      });
  }
  return opId;
}
