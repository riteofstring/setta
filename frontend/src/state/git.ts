import type {
  GetGitCommitDetailsResponse,
  GetGitCommitFileDiffResponse,
  GetGitDiffResponse,
  GetGitLogResponse,
  GetGitStatusResponse,
  GitDiffMode,
} from "utils/generatedTypes";
import type { GitGraphRow, GitGraphRowComputationState } from "utils/gitGraph";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "./utils";

type GitDiffOverlayState = {
  path: string;
  oldPath: string | null;
  mode: GitDiffMode;
  hasStaged: boolean;
  hasUnstaged: boolean;
  response: GetGitDiffResponse | null;
  isLoading: boolean;
  error: string | null;
};

type GitGraphOverlayState = {
  projectConfigId: string | null;
  allRefs: boolean;
  response: GetGitLogResponse | null;
  seenCommitHashes: Set<string>;
  rows: GitGraphRow[];
  rowComputationState: GitGraphRowComputationState;
  filterText: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  hasMore: boolean;
  nextOffset: number | null;
  pageSize: number;
  isCapped: boolean;
  selectedCommitHash: string | null;
  selectedCommitDetails: GetGitCommitDetailsResponse | null;
  selectedCommitDetailsIsLoading: boolean;
  selectedCommitDetailsError: string | null;
  selectedCommitFilePath: string | null;
  selectedCommitFileDiffResponse: GetGitCommitFileDiffResponse | null;
  selectedCommitFileDiffIsLoading: boolean;
  selectedCommitFileDiffError: string | null;
};

type GitOverlayState =
  | { kind: "none" }
  | { kind: "diff"; diff: GitDiffOverlayState };

type GitStatusState = {
  response: GetGitStatusResponse | null;
  diffAvailabilityByPath: Map<
    string,
    { hasStaged: boolean; hasUnstaged: boolean }
  >;
  isLoading: boolean;
  error: string | null;
};

type GitState = {
  status: GitStatusState;
  overlay: GitOverlayState;
  graph: GitGraphOverlayState | null;
};

export const useGitStore = createWithEqualityFn(
  withResetFn<GitState>(() => ({
    status: {
      response: null,
      diffAvailabilityByPath: new Map(),
      isLoading: false,
      error: null,
    },
    overlay: { kind: "none" },
    graph: null,
  })),
);
