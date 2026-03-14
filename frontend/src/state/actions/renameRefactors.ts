import { ModalTypeEnum } from "components/Modals/types";
import { openRenameReferencesModal } from "state/actions/modal";
import {
  NULL_PROJECT_CONFIG_ID,
  usePendingOperations,
  useProjectState,
  useRenameRefactors,
} from "state/definitions";
import { useModal } from "state/stores/feedbackStores";
import { post } from "utils/endpointUtils";
import {
  RenameRefactorBroadcastContent,
  RenameRefactorModeEnum,
} from "utils/generatedTypes";

export function handleRenameRefactorBroadcast(
  content: RenameRefactorBroadcastContent,
) {
  const currProjectConfigId = useProjectState.getState().projectConfig.id;
  if (
    currProjectConfigId === NULL_PROJECT_CONFIG_ID ||
    content.projectConfigId !== currProjectConfigId
  ) {
    return;
  }

  if (content.renameMode === RenameRefactorModeEnum.ALWAYS_ASK) {
    saveRenameBroadcast(content);
    return;
  }

  clearRenameBroadcast(content.frontendOpId);
}

function saveRenameBroadcast(content: RenameRefactorBroadcastContent) {
  useRenameRefactors.setState((state) => {
    const nextQueue = state.queue.includes(content.frontendOpId)
      ? state.queue
      : [...state.queue, content.frontendOpId];
    const { [content.frontendOpId]: _removed, ...restReady } = state.readyOpIds;
    return {
      byOpId: { ...state.byOpId, [content.frontendOpId]: content },
      queue: nextQueue,
      readyOpIds: restReady,
    };
  });

  const isOpStillPending = usePendingOperations
    .getState()
    .pending.some((op) => op.opId === content.frontendOpId);

  if (!isOpStillPending) {
    markRenameBroadcastsReady([content.frontendOpId]);
    maybeOpenNextRenamePrompt();
  }
}

function clearRenameBroadcast(frontendOpId: string) {
  useRenameRefactors.setState((state) => {
    const existsInState =
      state.byOpId[frontendOpId] ||
      state.queue.includes(frontendOpId) ||
      state.readyOpIds[frontendOpId];
    if (!existsInState) {
      return state;
    }

    const nextByOpId = { ...state.byOpId };
    delete nextByOpId[frontendOpId];

    const nextQueue = state.queue.filter((opId) => opId !== frontendOpId);

    const { [frontendOpId]: _removedReady, ...restReady } = state.readyOpIds;

    return {
      byOpId: nextByOpId,
      queue: nextQueue,
      readyOpIds: restReady,
    };
  });
}

function resetRenameBroadcasts() {
  useRenameRefactors.getState().reset();
}

export function markRenameBroadcastsReady(completedOpIds: Iterable<string>) {
  const ids = Array.from(completedOpIds);
  if (ids.length === 0) {
    return;
  }

  useRenameRefactors.setState((state) => {
    let changed = false;
    const nextReady = { ...state.readyOpIds };

    for (const id of ids) {
      if (state.byOpId[id] && state.queue.includes(id) && !nextReady[id]) {
        changed = true;
        nextReady[id] = true;
      }
    }

    if (!changed) {
      return state;
    }

    return {
      byOpId: state.byOpId,
      queue: state.queue,
      readyOpIds: nextReady,
    };
  });
}

function shiftNextReadyRenameBroadcast() {
  let nextPrompt: RenameRefactorBroadcastContent | undefined;

  useRenameRefactors.setState((state) => {
    if (state.queue.length === 0) {
      return state;
    }

    const [head, ...restQueue] = state.queue;
    if (!state.readyOpIds[head]) {
      return state;
    }

    nextPrompt = state.byOpId[head];

    const nextByOpId = { ...state.byOpId };
    delete nextByOpId[head];

    const { [head]: _removedReady, ...restReady } = state.readyOpIds;

    return {
      byOpId: nextByOpId,
      queue: restQueue,
      readyOpIds: restReady,
    };
  });

  return nextPrompt;
}

export function maybeOpenNextRenamePrompt() {
  const modalState = useModal.getState();
  if (
    modalState.open &&
    modalState.modalInfo?.type === ModalTypeEnum.RENAME_REFERENCES
  ) {
    return;
  }

  const nextPrompt = shiftNextReadyRenameBroadcast();
  if (!nextPrompt) {
    return;
  }

  openRenameReferencesModal({
    frontendOpId: nextPrompt.frontendOpId,
    projectConfigId: nextPrompt.projectConfigId,
    changedValues: nextPrompt.changedNodeValues,
  });
}

export async function acceptRenameRefactor(
  projectConfigId: string,
  frontendOpId: string,
) {
  await post("/acceptRenameRefactor", { projectConfigId, frontendOpId });
  clearRenameBroadcast(frontendOpId);
}

export async function declineRenameRefactor(
  projectConfigId: string,
  frontendOpId: string,
) {
  await post("/declineRenameRefactor", { projectConfigId, frontendOpId });
  clearRenameBroadcast(frontendOpId);
}
