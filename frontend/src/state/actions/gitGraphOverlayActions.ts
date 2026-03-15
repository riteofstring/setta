import { ensureTrackedGitPaneGraphWindow } from "state/actions/projectChatWindowingTrackedGitPane";
import { useGitStore } from "state/git";

import { refreshGitGraphData } from "./gitGraphRefreshState";
import {
  createInitialGitGraphState,
  getCurrentGitGraphProjectConfigId,
  getGitGraphState,
} from "./gitGraphState";

export async function ensureGitGraphStateLoaded(): Promise<void> {
  const projectConfigId = getCurrentGitGraphProjectConfigId();
  const existingGraphState = getGitGraphState();
  if (
    existingGraphState &&
    existingGraphState.projectConfigId === projectConfigId
  ) {
    return;
  }
  const allRefs = false;
  useGitStore.setState((state) => ({
    ...state,
    graph: createInitialGitGraphState({
      projectConfigId,
      allRefs,
      filterText: "",
    }),
  }));
  await refreshGitGraphData({ allRefs, skipPreloadState: true });
}

export async function openGitGraphOverlay(): Promise<void> {
  const allRefs = false;
  ensureTrackedGitPaneGraphWindow({
    title: "Git Graph",
  });
  const projectConfigId = getCurrentGitGraphProjectConfigId();
  useGitStore.setState((state) => ({
    ...state,
    overlay: { kind: "none" },
    graph: createInitialGitGraphState({
      projectConfigId,
      allRefs,
      filterText: "",
    }),
  }));
  await refreshGitGraphData({ allRefs, skipPreloadState: true });
}

export async function refreshGitGraphOverlay(): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  await refreshGitGraphData({ allRefs: graph.allRefs });
}

export async function toggleGitGraphAllRefs(): Promise<void> {
  const graph = getGitGraphState();
  if (!graph) {
    return;
  }
  await refreshGitGraphData({ allRefs: !graph.allRefs });
}
