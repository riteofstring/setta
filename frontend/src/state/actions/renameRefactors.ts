import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useRenameRefactors,
} from "state/definitions";
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

export function saveRenameBroadcast(
  content: RenameRefactorBroadcastContent,
) {
  useRenameRefactors.setState((state) => ({
    byOpId: { ...state.byOpId, [content.frontendOpId]: content },
  }));
}

export function getRenameBroadcast(frontendOpId: string) {
  return useRenameRefactors.getState().byOpId[frontendOpId];
}

export function popRenameBroadcast(frontendOpId: string) {
  const existing = getRenameBroadcast(frontendOpId);
  if (!existing) {
    return undefined;
  }

  useRenameRefactors.setState((state) => {
    const next = { ...state.byOpId };
    delete next[frontendOpId];
    return { byOpId: next };
  });

  return existing;
}

export function clearRenameBroadcast(frontendOpId: string) {
  useRenameRefactors.setState((state) => {
    if (!state.byOpId[frontendOpId]) {
      return state;
    }

    const next = { ...state.byOpId };
    delete next[frontendOpId];
    return { byOpId: next };
  });
}

export function resetRenameBroadcasts() {
  useRenameRefactors.getState().reset();
}

export async function acceptRenameRefactor(
  projectConfigId: string,
  frontendOpId: string,
) {
  await post("/acceptRenameRefactor", { projectConfigId, frontendOpId });
}

export async function declineRenameRefactor(
  projectConfigId: string,
  frontendOpId: string,
) {
  await post("/declineRenameRefactor", { projectConfigId, frontendOpId });
}
