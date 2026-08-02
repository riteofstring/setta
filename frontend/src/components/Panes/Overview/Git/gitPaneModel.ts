import type {
  GitreadStatusResponse as GitStatusResponse,
  GitreadGitWorktreeEntry as GitWorktreeEntry,
  GitreadStatusEntry as StatusEntry,
} from "openapi/http";

const GIT_GROUP_DEFINITIONS = [
  { key: "conflicts", title: "Conflicts", diffMode: "unstaged" },
  { key: "staged", title: "Staged Changes", diffMode: "staged" },
  { key: "unstaged", title: "Changes", diffMode: "unstaged" },
  { key: "untracked", title: "Untracked", diffMode: "unstaged" },
] as const;

type GitGroupKey = (typeof GIT_GROUP_DEFINITIONS)[number]["key"];
type GitDiffMode = (typeof GIT_GROUP_DEFINITIONS)[number]["diffMode"];

type GitPaneStatusState = {
  error: string | null;
  isLoading: boolean;
  response: GitStatusResponse | null;
};

export type GitPaneGroup = {
  diffMode: GitDiffMode;
  entries: StatusEntry[];
  title: string;
};

type GitPaneModel = {
  groups: GitPaneGroup[];
  hasAdditionalWorktrees: boolean;
  isGitRepo: boolean;
  isStatusTruncated: boolean;
  repoRoot: string | null;
  showEmptyRepoState: boolean;
  subtitle: string | null;
  worktrees: GitWorktreeEntry[];
};

export function shouldAutoRefreshGitStatus(
  status: GitPaneStatusState,
): boolean {
  return !status.response && !status.isLoading && !status.error;
}

export function buildGitPaneModel(status: GitPaneStatusState): GitPaneModel {
  return {
    groups: buildGitPaneGroups(status.response?.entries ?? []),
    ...buildGitPaneRepoState(status.response, status.isLoading),
  };
}

function buildGitPaneGroups(entries: StatusEntry[]): GitPaneGroup[] {
  const grouped = groupGitStatusEntries(entries);
  return GIT_GROUP_DEFINITIONS.map(({ key, ...group }) => ({
    ...group,
    entries: grouped[key],
  }));
}

function buildGitRepoSubtitle(
  repo: GitStatusResponse["repo"] | null,
): string | null {
  if (!repo?.isGitRepo) {
    return null;
  }
  const headLabel = repo.headBranch || "Detached HEAD";
  return repo.headCommit
    ? `${headLabel} · ${repo.headCommit.slice(0, 8)}`
    : headLabel;
}

function buildGitPaneRepoState(
  response: GitStatusResponse | null,
  isLoading: boolean,
): Omit<GitPaneModel, "groups"> {
  const worktrees = response?.worktrees ?? [];
  const repoDetails = buildGitRepoDetails(response?.repo ?? null);

  return {
    hasAdditionalWorktrees: hasAdditionalGitWorktrees(worktrees),
    ...repoDetails,
    isStatusTruncated: response?.isTruncated === true,
    showEmptyRepoState: Boolean(
      response && !isLoading && !repoDetails.isGitRepo,
    ),
    worktrees,
  };
}

function hasAdditionalGitWorktrees(worktrees: GitWorktreeEntry[]): boolean {
  return worktrees.some((worktree) => !worktree.isCurrent);
}

function buildGitRepoDetails(
  repo: GitStatusResponse["repo"] | null,
): Pick<GitPaneModel, "isGitRepo" | "repoRoot" | "subtitle"> {
  return {
    isGitRepo: repo?.isGitRepo === true,
    repoRoot: repo?.repoRoot ?? null,
    subtitle: buildGitRepoSubtitle(repo),
  };
}

function groupGitStatusEntries(
  entries: StatusEntry[],
): Record<GitGroupKey, StatusEntry[]> {
  const grouped: Record<GitGroupKey, StatusEntry[]> = {
    conflicts: [],
    staged: [],
    unstaged: [],
    untracked: [],
  };

  for (const entry of entries) {
    switch (entry.kind) {
      case "conflict":
        grouped.conflicts.push(entry);
        break;
      case "staged":
        grouped.staged.push(entry);
        break;
      case "unstaged":
        grouped.unstaged.push(entry);
        break;
      case "untracked":
        grouped.untracked.push(entry);
        break;
      default:
        break;
    }
  }

  return grouped;
}
