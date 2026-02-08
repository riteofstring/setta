import { useEffect, useMemo } from "react";
import {
  openGitDiffOverlay,
  openGitGraphOverlay,
  refreshGitStatus,
} from "state/actions/git";
import { useGitStore } from "state/git";
import type { GitStatusEntry } from "utils/generatedTypes";

export function GitPane() {
  const { response, isLoading, error } = useGitStore((x) => x.status);

  useEffect(() => {
    // Avoid a tight retry loop if git status fails (user can still hit Refresh).
    if (!response && !isLoading && !error) {
      void refreshGitStatus();
    }
  }, [response, isLoading, error]);

  const grouped = useMemo(() => {
    const entries = response?.entries ?? [];
    const conflicts: GitStatusEntry[] = [];
    const staged: GitStatusEntry[] = [];
    const unstaged: GitStatusEntry[] = [];
    const untracked: GitStatusEntry[] = [];
    for (const entry of entries) {
      switch (entry.kind) {
        case "conflict":
          conflicts.push(entry);
          break;
        case "staged":
          staged.push(entry);
          break;
        case "unstaged":
          unstaged.push(entry);
          break;
        case "untracked":
          untracked.push(entry);
          break;
        default:
          entry.kind satisfies never;
      }
    }
    return { conflicts, staged, unstaged, untracked };
  }, [response]);

  const repo = response?.repo ?? null;
  const isGitRepo = repo?.isGitRepo === true;
  const headBranch = repo?.headBranch ?? null;
  const headCommit = repo?.headCommit ?? null;
  const repoRoot = repo?.repoRoot ?? null;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-setta-800 dark:text-setta-50">
            Git
          </div>
          {isGitRepo && (
            <div className="truncate text-[11px] text-setta-500 dark:text-setta-400">
              {headBranch ? headBranch : "Detached HEAD"}
              {headCommit ? ` · ${headCommit.slice(0, 8)}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            onClick={() => void refreshGitStatus()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            onClick={() => void openGitGraphOverlay()}
            disabled={!isGitRepo}
          >
            Graph
          </button>
        </div>
      </div>

      {repoRoot && (
        <div className="mt-2 truncate rounded-md border border-setta-200 bg-white px-2 py-1 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-400">
          {repoRoot}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {!isLoading && response && !isGitRepo && (
        <div className="mt-3 rounded-md border border-setta-200 bg-white px-3 py-3 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-300">
          Current workspace is not a git repository.
        </div>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="py-4 text-center text-xs text-setta-500 dark:text-setta-300">
            Loading git status…
          </div>
        )}

        {isGitRepo && (
          <div className="space-y-4">
            <GitGroup
              title="Conflicts"
              entries={grouped.conflicts}
              onClickEntry={(entry) =>
                void openGitDiffOverlay({ path: entry.path, mode: "unstaged" })
              }
            />
            <GitGroup
              title="Staged Changes"
              entries={grouped.staged}
              onClickEntry={(entry) =>
                void openGitDiffOverlay({ path: entry.path, mode: "staged" })
              }
            />
            <GitGroup
              title="Changes"
              entries={grouped.unstaged}
              onClickEntry={(entry) =>
                void openGitDiffOverlay({ path: entry.path, mode: "unstaged" })
              }
            />
            <GitGroup
              title="Untracked"
              entries={grouped.untracked}
              onClickEntry={(entry) =>
                void openGitDiffOverlay({ path: entry.path, mode: "unstaged" })
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

function GitGroup({
  title,
  entries,
  onClickEntry,
}: {
  title: string;
  entries: GitStatusEntry[];
  onClickEntry: (entry: GitStatusEntry) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
          {title}
        </h3>
        <span className="text-[11px] text-setta-400 dark:text-setta-500">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md border border-setta-200 bg-white px-2 py-2 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-400">
          None
        </div>
      ) : (
        <ul className="overflow-hidden rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.path}-${entry.oldPath ?? ""}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-setta-800 hover:bg-setta-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-50 dark:hover:bg-setta-900"
                onClick={() => onClickEntry(entry)}
              >
                <StatusBadge entry={entry} />
                <span className="min-w-0 flex-1 truncate">
                  {entry.oldPath && entry.oldPath !== entry.path
                    ? `${entry.oldPath} -> ${entry.path}`
                    : entry.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ entry }: { entry: GitStatusEntry }) {
  let label = `${entry.indexStatus}${entry.worktreeStatus}`;
  if (entry.kind === "staged") {
    label = entry.indexStatus;
  } else if (entry.kind === "unstaged") {
    label = entry.worktreeStatus;
  } else if (entry.kind === "untracked") {
    label = "??";
  }

  return (
    <span className="inline-flex w-8 shrink-0 items-center justify-center rounded-md bg-setta-100 px-1 py-0.5 font-mono text-[11px] font-semibold text-setta-600 dark:bg-setta-900 dark:text-setta-300">
      {label}
    </span>
  );
}
