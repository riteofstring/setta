import { useProjectState } from "state/definitions";
import { describe, expect, it } from "vitest";

import {
  createClearedGitGraphSelectionState,
  createInitialGitGraphState,
  DEFAULT_GIT_GRAPH_PAGE_SIZE,
  getCurrentGitGraphProjectConfigId,
} from "./gitGraphState";

describe("gitGraphState", () => {
  it("creates initial graph state with cleared selection and default paging", () => {
    const state = createInitialGitGraphState({
      projectConfigId: "project-1",
      allRefs: false,
      filterText: "feature",
    });

    expect(state.projectConfigId).toBe("project-1");
    expect(state.allRefs).toBe(false);
    expect(state.filterText).toBe("feature");
    expect(state.pageSize).toBe(DEFAULT_GIT_GRAPH_PAGE_SIZE);
    expect(state.isLoading).toBe(true);
    expect(state.isLoadingMore).toBe(false);
    expect(state.rows).toEqual([]);
    expect(state.seenCommitHashes.size).toBe(0);
    expect(state.selectedCommitHash).toBeNull();
    expect(state.selectedCommitDetails).toBeNull();
    expect(state.selectedCommitFileDiffResponse).toBeNull();
  });

  it("clears commit and file diff selection fields together", () => {
    expect(createClearedGitGraphSelectionState()).toEqual({
      selectedCommitHash: null,
      selectedCommitDetails: null,
      selectedCommitDetailsIsLoading: false,
      selectedCommitDetailsError: null,
      selectedCommitFilePath: null,
      selectedCommitFileDiffResponse: null,
      selectedCommitFileDiffIsLoading: false,
      selectedCommitFileDiffError: null,
    });
  });

  it("returns null when the current project config id is blank", () => {
    useProjectState.setState((state) => {
      state.projectConfig.id = "   ";
    });

    expect(getCurrentGitGraphProjectConfigId()).toBeNull();
  });
});
