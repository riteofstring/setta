import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import {
  closeGitOverlay,
  setGitDiffMode,
} from "state/actions/gitDiffOverlayActions";
import { useGitStore } from "state/git";

export function GitDiffOverlay() {
  const diffState = useGitStore((x) =>
    x.overlay.kind === "diff" ? x.overlay.diff : null,
  );

  if (!diffState) {
    return null;
  }
  const headerPath = diffState.path;

  const diffText = diffState.response?.diff ?? "";
  const isTruncated = diffState.response?.isTruncated === true;
  const canShowUnstaged = diffState.hasUnstaged;
  const canShowStaged = diffState.hasStaged;

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border border-setta-200 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-950">
      <header className="flex items-center gap-2 border-b border-setta-200/80 bg-white/80 px-3 py-2 backdrop-blur dark:border-setta-800/80 dark:bg-setta-950/70">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-setta-400 dark:text-setta-500">
            Git Diff
          </div>
          <div className="truncate font-mono text-[12px] text-setta-900 dark:text-setta-50">
            {headerPath}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DiffModeButton
            label="Unstaged"
            active={diffState.mode === "unstaged"}
            disabled={!canShowUnstaged}
            onClick={() => void setGitDiffMode("unstaged")}
          />
          <DiffModeButton
            label="Staged"
            active={diffState.mode === "staged"}
            disabled={!canShowStaged}
            onClick={() => void setGitDiffMode("staged")}
          />
        </div>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
          onClick={closeGitOverlay}
          aria-label="Close git diff"
        >
          Close
        </button>
      </header>

      {isTruncated && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Diff output truncated for performance.
        </div>
      )}

      {diffState.error && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {diffState.error}
        </div>
      )}

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {diffState.isLoading ? (
          <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
            Loading diff…
          </div>
        ) : diffText.trim() ? (
          <GitDiffCodeMirror
            value={diffText}
            filePathForLanguage={diffState.path}
            height="100%"
            className="h-full min-h-0 w-full min-w-0 [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
          />
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
            No diff to display.
          </div>
        )}
      </div>
    </section>
  );
}

function DiffModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  let classes =
    "rounded-md px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
  if (active) {
    classes = `${classes} bg-blue-600 text-white`;
  } else {
    classes = `${classes} text-setta-600 hover:bg-setta-100 hover:text-setta-900 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50`;
  }
  if (disabled) {
    classes = `${classes} cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent`;
  }
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
