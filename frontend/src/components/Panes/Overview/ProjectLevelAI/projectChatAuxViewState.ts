import {
  useLocalStorage,
  useProjectState,
  type ProjectChatAuxView,
} from "state/definitions";

type ResolveProjectChatAuxViewByProjectConfigIdUpdateInput = {
  projectChatAuxViewByProjectConfigId: Record<string, ProjectChatAuxView>;
  projectConfigId: string;
  nextAuxView: ProjectChatAuxView;
};

type ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput = {
  draftMessageByProjectConfigId: Record<string, string>;
  projectConfigId: string;
  nextDraftMessage: string;
};

function resolveProjectChatAuxViewByProjectConfigIdUpdate({
  projectChatAuxViewByProjectConfigId,
  projectConfigId,
  nextAuxView,
}: ResolveProjectChatAuxViewByProjectConfigIdUpdateInput): Record<
  string,
  ProjectChatAuxView
> | null {
  const currentAuxView =
    projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
  if (currentAuxView === nextAuxView) {
    return null;
  }
  const nextByProjectConfigId = {
    ...projectChatAuxViewByProjectConfigId,
  };
  if (nextAuxView === "none") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextAuxView;
  }
  return nextByProjectConfigId;
}

export function resolveProjectChatDraftMessageByProjectConfigIdUpdate({
  draftMessageByProjectConfigId,
  projectConfigId,
  nextDraftMessage,
}: ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput): Record<
  string,
  string
> | null {
  const currentDraftMessage =
    draftMessageByProjectConfigId[projectConfigId] ?? "";
  if (currentDraftMessage === nextDraftMessage) {
    return null;
  }
  const nextByProjectConfigId = {
    ...draftMessageByProjectConfigId,
  };
  if (nextDraftMessage === "") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextDraftMessage;
  }
  return nextByProjectConfigId;
}

export function setProjectChatAuxViewForActiveProject(
  nextAuxView: ProjectChatAuxView,
): void {
  useLocalStorage.setState((state) => {
    const activeProjectConfigId = useProjectState.getState().projectConfig.id;
    const nextByProjectConfigId =
      resolveProjectChatAuxViewByProjectConfigIdUpdate({
        projectChatAuxViewByProjectConfigId:
          state.projectChatAuxViewByProjectConfigId,
        projectConfigId: activeProjectConfigId,
        nextAuxView,
      });
    if (!nextByProjectConfigId) {
      return state;
    }
    return {
      projectChatAuxViewByProjectConfigId: nextByProjectConfigId,
    };
  });
}
