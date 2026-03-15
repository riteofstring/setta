import { useProjectState } from "state/definitions";
import { useGitStore } from "state/git";
import { createEmptyGitGraphRowComputationState } from "utils/gitGraph";

export const DEFAULT_GIT_GRAPH_PAGE_SIZE = 250;

export function getCurrentGitGraphProjectConfigId(): string | null {
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (typeof projectConfigId !== "string" || projectConfigId.trim() === "") {
    return null;
  }
  return projectConfigId;
}

export function createClearedGitGraphSelectionState() {
  return {
    selectedCommitHash: null,
    selectedCommitDetails: null,
    selectedCommitDetailsIsLoading: false,
    selectedCommitDetailsError: null,
    selectedCommitFilePath: null,
    selectedCommitFileDiffResponse: null,
    selectedCommitFileDiffIsLoading: false,
    selectedCommitFileDiffError: null,
  };
}

export function createInitialGitGraphState({
  projectConfigId,
  allRefs,
  filterText,
}: {
  projectConfigId: string | null;
  allRefs: boolean;
  filterText: string;
}) {
  return {
    projectConfigId,
    allRefs,
    response: null,
    seenCommitHashes: new Set<string>(),
    rows: [],
    rowComputationState: createEmptyGitGraphRowComputationState(),
    filterText,
    isLoading: true,
    isLoadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    nextOffset: null,
    pageSize: DEFAULT_GIT_GRAPH_PAGE_SIZE,
    isCapped: false,
    ...createClearedGitGraphSelectionState(),
  };
}

export function getGitGraphState() {
  return useGitStore.getState().graph;
}
