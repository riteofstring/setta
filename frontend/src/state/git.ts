import type {
  GetGitCommitDetailsResponse,
  GetGitCommitFileDiffResponse,
  GetGitDiffResponse,
  GetGitLogResponse,
  GetGitStatusResponse,
  GitDiffMode,
} from "utils/generatedTypes";
import type { GitGraphRow } from "utils/gitGraph";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "./utils";

type GitOverlayKind = "none" | "diff" | "graph";

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
  allRefs: boolean;
  response: GetGitLogResponse | null;
  rows: GitGraphRow[];
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
  | { kind: "diff"; diff: GitDiffOverlayState }
  | { kind: "graph"; graph: GitGraphOverlayState };

type GitStatusState = {
  response: GetGitStatusResponse | null;
  isLoading: boolean;
  error: string | null;
};

type GitState = {
  status: GitStatusState;
  overlay: GitOverlayState;
};

export const useGitStore = createWithEqualityFn(
  withResetFn<GitState>(() => ({
    status: {
      response: null,
      isLoading: false,
      error: null,
    },
    overlay: { kind: "none" },
  })),
);
