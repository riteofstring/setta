import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import {
  gitFileStatusCategoryFromCommitFile,
  gitFileStatusVisuals,
} from "components/Git/gitFileStatusVisuals";
import {
  selectGitCommit,
  selectGitCommitFile,
} from "state/actions/gitGraphSelection";
import { useGitStore } from "state/git";
import type {
  GetGitCommitDetailsResponse,
  GetGitCommitFileDiffResponse,
  GitCommit,
  GitCommitChangedFile,
} from "utils/generatedTypes";
import { GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX } from "./gitGraphOverlayResizeModel";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

type GitGraphOverlaySelectedCommitPaneProps = {
  selectedCommit: GitCommit | null;
  selectedCommitFilePath: string | null;
  selectedCommitFileDiffResponse: GetGitCommitFileDiffResponse | null;
  selectedCommitFileDiffIsLoading: boolean;
  selectedCommitFileDiffError: string | null;
  selectedCommitDetailsTruncated: boolean;
};

// Owns the selected-commit summary, details, changed-file list, and diff view.
export function GitGraphOverlaySelectedCommitPane({
  selectedCommit,
  selectedCommitFilePath,
  selectedCommitFileDiffResponse,
  selectedCommitFileDiffIsLoading,
  selectedCommitFileDiffError,
  selectedCommitDetailsTruncated,
}: GitGraphOverlaySelectedCommitPaneProps) {
  return (
    <section
      data-testid="git-graph-diff-pane"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ minWidth: `${GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX}px` }}
    >
      <div className="border-b border-setta-200/70 px-3 py-2 dark:border-setta-800/70">
        {selectedCommit ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-setta-900 dark:text-setta-50">
                  {selectedCommit.subject}
                </div>
                <div className="truncate text-[11px] text-setta-500 dark:text-setta-400">
                  {selectedCommit.authorName} ·{" "}
                  {DATE_FORMATTER.format(new Date(selectedCommit.authorTimeMs))}{" "}
                  · {selectedCommit.hash.slice(0, 8)}
                </div>
                {selectedCommitFilePath ? (
                  <div className="truncate font-mono text-[12px] text-setta-700 dark:text-setta-200">
                    {selectedCommitFilePath}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
                onClick={() => void selectGitCommit(selectedCommit.hash)}
              >
                Reload
              </button>
            </div>
            {selectedCommit.decorations.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedCommit.decorations.slice(0, 6).map((decoration) => (
                  <span
                    key={decoration}
                    className="rounded-full border border-setta-200 bg-setta-50 px-2 py-0.5 text-[10px] font-semibold text-setta-600 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300"
                  >
                    {decoration}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-setta-500 dark:text-setta-300">
            Select a commit to view details.
          </div>
        )}
      </div>

      {selectedCommit && selectedCommitFileDiffResponse?.isTruncated ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Diff output truncated for performance.
        </div>
      ) : null}

      {selectedCommit && selectedCommitDetailsTruncated ? (
        <div
          data-testid="git-graph-commit-details-truncated-warning"
          className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          Commit details were truncated. The changed-file list may be
          incomplete.
        </div>
      ) : null}

      {selectedCommit && selectedCommitFileDiffError ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {selectedCommitFileDiffError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {!selectedCommit ? (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
            Select a commit to view details.
          </div>
        ) : selectedCommitFileDiffIsLoading ? (
          <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
            Loading file diff…
          </div>
        ) : selectedCommitFileDiffResponse?.diff ? (
          <GitDiffCodeMirror
            value={selectedCommitFileDiffResponse.diff}
            filePathForLanguage={selectedCommitFilePath}
            height="100%"
            className="h-full min-h-0 w-full min-w-0 [&_.cm-content]:text-[11px] [&_.cm-content]:leading-[16px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
          />
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
            Select a file to view its diff.
          </div>
        )}
      </div>
    </section>
  );
}

export function GitGraphOverlaySelectedCommitDetails({
  commitHash,
}: {
  commitHash: string;
}) {
  const {
    selectedCommitDetails,
    selectedCommitDetailsIsLoading,
    selectedCommitDetailsError,
    selectedFilePath,
  } = useGitStore((state) => {
    if (!state.graph || state.graph.selectedCommitHash !== commitHash) {
      return {
        selectedCommitDetails: null,
        selectedCommitDetailsIsLoading: false,
        selectedCommitDetailsError: null,
        selectedFilePath: null,
      };
    }
    return {
      selectedCommitDetails: state.graph.selectedCommitDetails,
      selectedCommitDetailsIsLoading:
        state.graph.selectedCommitDetailsIsLoading,
      selectedCommitDetailsError: state.graph.selectedCommitDetailsError,
      selectedFilePath: state.graph.selectedCommitFilePath,
    };
  });

  if (selectedCommitDetailsIsLoading) {
    return (
      <div className="text-xs text-setta-500 dark:text-setta-300">
        Loading commit details…
      </div>
    );
  }
  if (selectedCommitDetailsError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        {selectedCommitDetailsError}
      </div>
    );
  }
  if (
    selectedCommitDetails &&
    selectedCommitDetails.commitHash === commitHash
  ) {
    return (
      <GitGraphOverlayExpandedCommitDetails
        details={selectedCommitDetails}
        selectedFilePath={selectedFilePath}
      />
    );
  }
  return (
    <div className="text-xs text-setta-500 dark:text-setta-300">
      No details available.
    </div>
  );
}

function GitGraphOverlayExpandedCommitDetails({
  details,
  selectedFilePath,
}: {
  details: GetGitCommitDetailsResponse;
  selectedFilePath: string | null;
}) {
  const parentsLabel = details.parents
    .map((parent) => parent.slice(0, 8))
    .join(" ");
  const authorDate = DATE_FORMATTER.format(new Date(details.authorTimeMs));
  const committerDate = DATE_FORMATTER.format(
    new Date(details.committerTimeMs),
  );
  const showCommitter =
    details.committerName !== details.authorName ||
    details.committerEmail !== details.authorEmail ||
    details.committerTimeMs !== details.authorTimeMs;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,380px)]">
      <div className="min-w-0">
        <div className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-[11px] text-setta-600 dark:text-setta-300">
          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Commit
          </div>
          <div className="min-w-0 truncate font-mono text-setta-700 dark:text-setta-200">
            {details.commitHash}
          </div>

          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Parents
          </div>
          <div className="min-w-0 truncate font-mono text-setta-700 dark:text-setta-200">
            {parentsLabel || "-"}
          </div>

          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Author
          </div>
          <div className="min-w-0 truncate text-setta-700 dark:text-setta-200">
            {details.authorName} · {authorDate}
          </div>

          {showCommitter ? (
            <>
              <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
                Committer
              </div>
              <div className="min-w-0 truncate text-setta-700 dark:text-setta-200">
                {details.committerName} · {committerDate}
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-2 min-w-0">
          <div className="text-xs font-semibold text-setta-900 dark:text-setta-50">
            {details.subject}
          </div>
          {details.body.trim() ? (
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-setta-700 dark:text-setta-200">
              {details.body}
            </pre>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Files changed
          </div>
          <div className="text-[11px] text-setta-400 dark:text-setta-500">
            {details.files.length}
          </div>
        </div>

        {details.files.length === 0 ? (
          <div className="rounded-md border border-setta-200 bg-white px-2 py-2 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-400">
            None
          </div>
        ) : (
          <ul
            data-testid="git-graph-files-list"
            className="max-h-56 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
          >
            {details.files.map((file) => (
              <li key={`${file.status}-${file.oldPath ?? ""}-${file.path}`}>
                <GitGraphOverlayCommitFileRow
                  file={file}
                  isSelected={selectedFilePath === file.path}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GitGraphOverlayCommitFileRow({
  file,
  isSelected,
}: {
  file: GitCommitChangedFile;
  isSelected: boolean;
}) {
  const additions =
    file.additions === null || file.additions === undefined
      ? "-"
      : file.additions.toString();
  const deletions =
    file.deletions === null || file.deletions === undefined
      ? "-"
      : file.deletions.toString();

  const base =
    "flex w-full items-center gap-2 overflow-hidden px-2 py-1 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "hover:bg-setta-50 dark:hover:bg-setta-900/60";
  const category = gitFileStatusCategoryFromCommitFile(file);
  const visuals = gitFileStatusVisuals(category);

  return (
    <button
      type="button"
      className={`${base} ${background}`}
      data-file-status-category={category}
      onClick={() =>
        void selectGitCommitFile({
          path: file.path,
          oldPath: file.oldPath ?? null,
        })
      }
    >
      <span
        className={`inline-flex w-10 shrink-0 items-center justify-center rounded-md px-1 py-0.5 font-mono text-[11px] font-semibold ${visuals.badgeClassName}`}
        data-file-status-category={category}
      >
        {file.status}
      </span>

      <span className="block min-w-0 flex-1 truncate font-mono text-setta-800 dark:text-setta-100">
        {file.oldPath && file.oldPath !== file.path ? (
          <>
            <span className="text-setta-500 dark:text-setta-400">
              {file.oldPath}
            </span>
            <span className="text-setta-400 dark:text-setta-500"> -&gt; </span>
            <PathWithMutedDir path={file.path} />
          </>
        ) : (
          <PathWithMutedDir path={file.path} />
        )}
      </span>

      <span className="shrink-0 font-mono text-[11px] text-setta-400 dark:text-setta-500">
        +{additions} | -{deletions}
      </span>
    </button>
  );
}

function PathWithMutedDir({ path }: { path: string }) {
  const lastSlashIndex = path.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return <span>{path}</span>;
  }
  const dir = path.slice(0, lastSlashIndex + 1);
  const base = path.slice(lastSlashIndex + 1);
  return (
    <>
      <span className="text-setta-400 dark:text-setta-500">{dir}</span>
      <span className="text-setta-800 dark:text-setta-100">{base}</span>
    </>
  );
}
