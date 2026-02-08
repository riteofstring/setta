import type {
  GetGitCommitDiffResponse,
  GetGitDiffResponse,
  GetGitLogResponse,
  GetGitStatusResponse,
  GitDiffMode,
  GitRepoInfoResponse,
} from "utils/generatedTypes";
import type { GitGraphRow } from "utils/gitGraph";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "./utils";

export type GitOverlayKind = "none" | "diff" | "graph";

export type GitDiffOverlayState = {
  path: string;
  mode: GitDiffMode;
  hasStaged: boolean;
  hasUnstaged: boolean;
  response: GetGitDiffResponse | null;
  isLoading: boolean;
  error: string | null;
};

export type GitGraphOverlayState = {
  allRefs: boolean;
  response: GetGitLogResponse | null;
  rows: GitGraphRow[];
  filterText: string;
  isLoading: boolean;
  error: string | null;
  selectedCommitHash: string | null;
  selectedCommitResponse: GetGitCommitDiffResponse | null;
  selectedCommitIsLoading: boolean;
  selectedCommitError: string | null;
};

export type GitOverlayState =
  | { kind: "none" }
  | { kind: "diff"; diff: GitDiffOverlayState }
  | { kind: "graph"; graph: GitGraphOverlayState };

export type GitStatusState = {
  response: GetGitStatusResponse | null;
  isLoading: boolean;
  error: string | null;
};

export type GitState = {
  status: GitStatusState;
  overlay: GitOverlayState;
  repoInfoOverride: GitRepoInfoResponse | null;
};

export const useGitStore = createWithEqualityFn(
  withResetFn<GitState>(() => ({
    status: {
      response: null,
      isLoading: false,
      error: null,
    },
    overlay: { kind: "none" },
    repoInfoOverride: null,
  })),
);
