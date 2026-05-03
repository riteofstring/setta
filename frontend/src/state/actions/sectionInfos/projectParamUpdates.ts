import { unstable_batchedUpdates } from "react-dom";

import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "state/actions/renameRefactors";

import {
  usePendingOperations,
  useProjectState,
  type PendingOperation,
  type ZustandProjectState,
} from "state/definitions";

import type { ProjectParamUpdateContent } from "utils/generatedTypes";

import { clearToolArgumentPreviewForProjectState } from "./codeObjectsAndLayout";

export function receiveProjectParamUpdate(content: ProjectParamUpdateContent) {
  const currentState = useProjectState.getState();
  if (currentState.projectConfig.id !== content.projectConfigId) {
    return;
  }

  const completedIds = new Set(content.completedOpIds ?? []);
  const nextPending = getNextPendingOperations(
    usePendingOperations.getState().pending,
    completedIds,
    new Set(content.pendingOpIds ?? []),
  );
  unstable_batchedUpdates(() => {
    usePendingOperations.setState({ pending: nextPending });
    useProjectState.setState((state) => {
      if (state.projectConfig.id !== content.projectConfigId) {
        return;
      }
      applyProjectParamUpdate(state, content);
      for (const opInfo of nextPending) {
        opInfo.apply(state);
      }
    });
  });
  clearToolArgumentPreviewForProjectState(
    content.projectConfigId,
    useProjectState.getState(),
  );
  markRenameBroadcastsReady(completedIds);
  maybeOpenNextRenamePrompt();
}

function applyProjectParamUpdate(
  state: ZustandProjectState,
  content: ProjectParamUpdateContent,
) {
  if (content.codeObjImpl === null) {
    throw new Error("Project param update is missing codeObjImpl.");
  }
  state.codeObjs[content.codeObj.id] = content.codeObj;
  state.codeObjVariants[content.codeObjVariant.id] = content.codeObjVariant;
  state.codeObjImpls[content.codeObjVariant.impl] = content.codeObjImpl;
}

export function getNextPendingOperations(
  currentPending: PendingOperation[],
  completedIds: Set<string>,
  backendPendingIds: Set<string>,
): PendingOperation[] {
  return currentPending.reduce<PendingOperation[]>((acc, opInfo) => {
    if (completedIds.has(opInfo.opId)) {
      return acc;
    }
    acc.push({
      ...opInfo,
      acknowledged: opInfo.acknowledged || backendPendingIds.has(opInfo.opId),
    });
    return acc;
  }, []);
}
