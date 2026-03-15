import { type SetStateAction } from "react";
import {
  useAIStore,
  useProjectState,
  type ProjectChatAuxView,
} from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";

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

// Owns project-scoped aux-view, draft-message, and threads-visibility writes
// so ProjectChat.tsx can stay focused on surface coordination.

export function resolveProjectChatAuxViewByProjectConfigIdUpdate({
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

export function setProjectChatDraftMessageForProjectConfig(
  projectConfigId: string,
  nextDraftMessage: SetStateAction<string>,
): void {
  useLocalStorage.setState((state) => {
    const currentDraftMessage =
      state.projectChatDraftMessageByProjectConfigId[projectConfigId] ?? "";
    const resolvedNextDraftMessage =
      typeof nextDraftMessage === "function"
        ? nextDraftMessage(currentDraftMessage)
        : nextDraftMessage;
    const nextByProjectConfigId =
      resolveProjectChatDraftMessageByProjectConfigIdUpdate({
        draftMessageByProjectConfigId:
          state.projectChatDraftMessageByProjectConfigId,
        projectConfigId,
        nextDraftMessage: resolvedNextDraftMessage,
      });
    if (!nextByProjectConfigId) {
      return state;
    }
    return {
      projectChatDraftMessageByProjectConfigId: nextByProjectConfigId,
    };
  });
}

export function setProjectChatThreadVisibility(
  nextVisibility: SetStateAction<boolean>,
): void {
  useAIStore.setState((state) => {
    const resolvedNextVisibility =
      typeof nextVisibility === "function"
        ? nextVisibility(state.viewThreads)
        : nextVisibility;
    if (resolvedNextVisibility === state.viewThreads) {
      return state;
    }
    return {
      viewThreads: resolvedNextVisibility,
    };
  });
}

export function setProjectChatThreadsClosedAtLargeWidthPreference(
  nextClosed: boolean,
): void {
  useAIStore.setState((state) => {
    if (state.projectChatThreadsExplicitlyClosedAtLargeWidth === nextClosed) {
      return state;
    }
    return {
      projectChatThreadsExplicitlyClosedAtLargeWidth: nextClosed,
    };
  });
}
