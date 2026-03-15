import { useMemo, useRef, type PointerEvent, type ReactNode } from "react";
import { closeGitOverlay } from "state/actions/gitDiffOverlayActions";
import { setGitGraphFilterText } from "state/actions/gitGraphFilterState";
import {
  refreshGitGraphOverlay,
  toggleGitGraphAllRefs,
} from "state/actions/gitGraphOverlayActions";
import { useGitStore } from "state/git";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { buildGitCommitLookupByHash } from "./gitGraphOverlayCommitIndex";
import { GitGraphOverlayCommitListSurface } from "./gitGraphOverlayCommitListSurface";
import {
  COMMIT_GRID_TEMPLATE_COLUMNS,
  CSS_VAR_GIT_GRAPH_SPLIT_PCT,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
  GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX,
} from "./gitGraphOverlayResizeModel";
import { GitGraphOverlaySelectedCommitPane } from "./gitGraphOverlaySelectedCommitPane";
import { useGitGraphOverlayResize } from "./useGitGraphOverlayResize";

// GitGraphOverlay stays the first-hop pane entrypoint. Local owners now handle
// commit indexing and the virtualized history list so this file can focus on
// split-pane composition and selected-commit handoff.

export function GitGraphOverlay({
  embedded = false,
  showCloseButton = true,
  extraHeaderActions = null,
  leftSidebar = null,
}: {
  embedded?: boolean;
  showCloseButton?: boolean;
  extraHeaderActions?: ReactNode;
  leftSidebar?: ReactNode;
}) {
  const graphState = useGitStore((x) => x.graph);
  const {
    darkMode,
    splitPct,
    graphColWidthPx,
    authorColWidthPx,
    dateColWidthPx,
    hashColWidthPx,
  } = useLocalStorage((x) => ({
    darkMode: x.darkMode,
    splitPct: x.gitGraphSplitPct,
    graphColWidthPx: x.gitGraphColWidthPx,
    authorColWidthPx: x.gitGraphAuthorWidthPx,
    dateColWidthPx: x.gitGraphDateWidthPx,
    hashColWidthPx: x.gitGraphHashWidthPx,
  }));

  const overlayRef = useRef<HTMLElement | null>(null);
  const panesWrapperRef = useRef<HTMLDivElement | null>(null);
  const commitHeaderRef = useRef<HTMLDivElement | null>(null);
  const { beginPaneSplitDrag, beginColumnResizeDrag, graphViewBoxWidth } =
    useGitGraphOverlayResize({
      overlayRef,
      panesWrapperRef,
      commitHeaderRef,
      splitPct,
      graphColWidthPx,
      authorColWidthPx,
      dateColWidthPx,
      hashColWidthPx,
    });

  const commits = graphState?.response?.commits ?? [];
  const commitsByHash = useMemo(() => {
    return buildGitCommitLookupByHash(commits);
  }, [commits]);

  if (!graphState) {
    return null;
  }

  const rows = graphState.rows;
  const filterText = graphState.filterText;
  const selectedCommit = graphState.selectedCommitHash
    ? commitsByHash.get(graphState.selectedCommitHash) ?? null
    : null;
  const repoRoot = graphState.response?.repoRoot ?? null;
  const headBranch = graphState.response?.headBranch ?? null;

  return (
    <section
      ref={overlayRef}
      data-testid="git-graph-overlay"
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white dark:bg-setta-950 ${
        embedded
          ? "border-0 shadow-none"
          : "border border-setta-200 shadow-sm dark:border-setta-800"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-setta-200/80 bg-white/80 px-3 py-2 backdrop-blur dark:border-setta-800/80 dark:bg-setta-950/70">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-setta-400 dark:text-setta-500">
            Git Graph
          </div>
          <div className="truncate text-xs text-setta-700 dark:text-setta-200">
            {repoRoot ? repoRoot : "Repo unavailable"}
            {headBranch ? ` · ${headBranch}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {extraHeaderActions}
          <input
            className="w-56 rounded-md border border-setta-200 bg-white px-2 py-1 text-xs text-setta-900 placeholder:text-setta-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-50 dark:placeholder:text-setta-500"
            placeholder="Filter commits…"
            value={filterText}
            onChange={(event) => setGitGraphFilterText(event.target.value)}
          />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            onClick={() => void toggleGitGraphAllRefs()}
            aria-label={
              graphState.allRefs ? "Show current branch only" : "Show all refs"
            }
          >
            {graphState.allRefs ? "All refs" : "Branch"}
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            onClick={() => void refreshGitGraphOverlay()}
          >
            Refresh
          </button>
          {showCloseButton ? (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
              onClick={closeGitOverlay}
            >
              Close
            </button>
          ) : null}
        </div>
      </header>

      {graphState.error && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {graphState.error}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        {leftSidebar ? (
          <aside
            data-testid="git-graph-left-sidebar"
            className="flex min-h-0 shrink-0 flex-col border-r border-setta-200 bg-setta-50/40 dark:border-setta-800 dark:bg-setta-900/30"
            style={{ width: "clamp(15rem, 24%, 20rem)" }}
          >
            {leftSidebar}
          </aside>
        ) : null}

        <div ref={panesWrapperRef} className="flex min-h-0 min-w-0 flex-1">
          <section
            data-testid="git-graph-history-pane"
            className="flex min-h-0 flex-col overflow-hidden"
            style={{
              minWidth: `${GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX}px`,
              width: `calc(var(${CSS_VAR_GIT_GRAPH_SPLIT_PCT}, ${DEFAULT_GIT_GRAPH_SPLIT_PCT}) * 1%)`,
            }}
          >
            <div
              ref={commitHeaderRef}
              className="grid gap-2 overflow-hidden border-b border-setta-200/70 bg-setta-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:border-setta-800/70 dark:bg-setta-900 dark:text-setta-500"
              style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
            >
              <div
                data-testid="git-graph-header-graph"
                className="relative min-w-0 truncate pr-2"
              >
                <span>Graph</span>
                <ColumnResizeHandle
                  dataTestId="git-graph-col-resize-graph-message"
                  label="Resize graph and message boundary"
                  edge="right"
                  onPointerDown={(event) =>
                    beginColumnResizeDrag("graphMessage", event)
                  }
                />
              </div>
              <div
                data-testid="git-graph-header-message"
                className="min-w-0 truncate pl-2"
              >
                Message
              </div>
              <div
                data-testid="git-graph-header-author"
                className="relative min-w-0 truncate pl-2"
              >
                <ColumnResizeHandle
                  dataTestId="git-graph-col-resize-message-author"
                  label="Resize message and author boundary"
                  edge="left"
                  onPointerDown={(event) =>
                    beginColumnResizeDrag("messageAuthor", event)
                  }
                />
                <span>Author</span>
              </div>
              <div
                data-testid="git-graph-header-date"
                className="relative min-w-0 truncate pl-2"
              >
                <ColumnResizeHandle
                  dataTestId="git-graph-col-resize-author-date"
                  label="Resize author and date boundary"
                  edge="left"
                  onPointerDown={(event) =>
                    beginColumnResizeDrag("authorDate", event)
                  }
                />
                <span>Date</span>
              </div>
              <div
                data-testid="git-graph-header-hash"
                className="relative min-w-0 truncate pl-2"
              >
                <ColumnResizeHandle
                  dataTestId="git-graph-col-resize-date-hash"
                  label="Resize date and hash boundary"
                  edge="left"
                  onPointerDown={(event) =>
                    beginColumnResizeDrag("dateHash", event)
                  }
                />
                <span>Hash</span>
              </div>
            </div>

            <GitGraphOverlayCommitListSurface
              rows={rows}
              commits={commits}
              filterText={filterText}
              allRefs={graphState.allRefs}
              selectedCommitHash={graphState.selectedCommitHash}
              darkMode={darkMode}
              graphViewBoxWidth={graphViewBoxWidth}
              isLoading={graphState.isLoading}
              isLoadingMore={graphState.isLoadingMore}
              loadMoreError={graphState.loadMoreError}
              hasMore={graphState.hasMore}
              nextOffset={graphState.nextOffset}
              isCapped={graphState.isCapped}
              error={graphState.error}
            />
          </section>

          <div
            data-testid="git-graph-pane-splitter"
            role="separator"
            aria-label="Resize git graph panes"
            className="group/resize relative w-3 cursor-col-resize bg-transparent"
            onPointerDown={beginPaneSplitDrag}
          >
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
          </div>

          <GitGraphOverlaySelectedCommitPane
            selectedCommit={selectedCommit}
            selectedCommitFilePath={graphState.selectedCommitFilePath}
            selectedCommitFileDiffResponse={
              graphState.selectedCommitFileDiffResponse
            }
            selectedCommitFileDiffIsLoading={
              graphState.selectedCommitFileDiffIsLoading
            }
            selectedCommitFileDiffError={graphState.selectedCommitFileDiffError}
            selectedCommitDetailsTruncated={
              graphState.selectedCommitDetails?.isTruncated ?? false
            }
          />
        </div>
      </div>
    </section>
  );
}

function ColumnResizeHandle({
  dataTestId,
  label,
  edge,
  onPointerDown,
}: {
  dataTestId: string;
  label: string;
  edge: "left" | "right";
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const rootPositionClass =
    edge === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";

  return (
    <div
      data-testid={dataTestId}
      role="separator"
      aria-label={label}
      className={`group/col-resize absolute top-0 z-10 h-full w-6 cursor-col-resize ${rootPositionClass}`}
      onPointerDown={onPointerDown}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-300 group-hover/col-resize:bg-blue-400 dark:bg-setta-700 dark:group-hover/col-resize:bg-blue-400" />
    </div>
  );
}
