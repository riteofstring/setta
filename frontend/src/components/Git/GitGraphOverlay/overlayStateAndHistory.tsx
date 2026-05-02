import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";

import type { GitreadCommit as Commit } from "openapi/http";

import { useMemo, useRef, type ReactNode, type RefObject } from "react";

import {
  List,
  useDynamicRowHeight,
  useListRef,
  type RowComponentProps,
} from "react-window";

import {
  closeGitOverlay,
  loadMoreGitGraphCommits,
  refreshGitGraphOverlay,
  selectGitCommit,
  setGitGraphFilterText,
  toggleGitGraphAllRefs,
} from "state/actions/git";

import { useGitStore } from "state/git";

import type { GitGraphRow } from "utils/gitGraph";

import { DEFAULT_GIT_GRAPH_SPLIT_PCT } from "utils/gitGraphLayoutDefaults";

import {
  buildGitCommitLookupByHash,
  buildGitGraphCommitDigest,
  buildGitGraphRowHeightCacheKey,
  shouldLoadMoreGitGraphCommits,
  type DecorationChipSummary,
  type GitGraphColumnBoundary,
  type GitGraphColumnWidths,
} from "./gitGraphOverlayUtils";

import {
  COMMIT_GRID_TEMPLATE_COLUMNS,
  CSS_VAR_GIT_GRAPH_SPLIT_PCT,
  DATE_FORMATTER,
  GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX,
  GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX,
  GitGraphColumnResizeDragArgs,
  GitGraphOverlayComputedData,
  GitGraphOverlayListSize,
  GitGraphOverlayModel,
  GitGraphOverlayProps,
  GitGraphOverlayState,
  GitGraphOverlayStateSlice,
  GitGraphPaneSplitDragArgs,
  LANE_COLORS_DARK,
  LANE_COLORS_LIGHT,
  ROW_HEIGHT,
  beginGitGraphColumnResizeDrag,
  beginGitGraphPaneSplitDrag,
  buildDecorationChipSummaryByHash,
  buildFilteredGitGraphRows,
  buildGitGraphCommitSearchBlobByHash,
  calculateGitGraphMaxLaneCount,
  createGitGraphPersistRequest,
  getSelectedGitGraphCommit,
  useGitGraphDragCleanupRegistry,
  useGitGraphListSize,
  useGitGraphLiveGraphColumnWidth,
  useGitGraphOverlayStorage,
  useGitGraphOverlayStyleSync,
} from "./graphData";

import { ColumnResizeHandle, GitCommitRow } from "./commitRowsAndCells";

export function getGitGraphOverlayStateSlice(
  graphState: GitGraphOverlayState | null,
): GitGraphOverlayStateSlice {
  if (!graphState) {
    return {
      rows: [],
      commits: [],
      filterText: "",
      selectedHash: null,
      allRefs: false,
      repoRoot: null,
      headBranch: null,
    };
  }

  return {
    rows: graphState.rows,
    commits: graphState.response?.commits ?? [],
    filterText: graphState.filterText,
    selectedHash: graphState.selectedCommitHash,
    allRefs: graphState.allRefs,
    repoRoot: graphState.response?.repoRoot ?? null,
    headBranch: graphState.response?.headBranch ?? null,
  };
}

export function useGitGraphOverlayComputedData({
  rows,
  commits,
  filterText,
  selectedHash,
  allRefs,
  darkMode,
  graphColWidthPx,
  liveGraphColWidthPx,
}: GitGraphOverlayStateSlice & {
  darkMode: boolean;
  graphColWidthPx: number;
  liveGraphColWidthPx: number | null;
}): GitGraphOverlayComputedData {
  const commitsByHash = useMemo(
    () => buildGitCommitLookupByHash(commits),
    [commits],
  );
  const commitSearchBlobByHash = useMemo(
    () => buildGitGraphCommitSearchBlobByHash(commits),
    [commits],
  );
  const selectedCommit = useMemo(
    () => getSelectedGitGraphCommit(selectedHash, commitsByHash),
    [commitsByHash, selectedHash],
  );
  const commitDigest = useMemo(
    () => buildGitGraphCommitDigest(commits),
    [commits],
  );
  const dynamicRowHeightCacheKey = useMemo(
    () =>
      buildGitGraphRowHeightCacheKey({
        commitDigest,
        allRefs,
        filterText,
      }),
    [allRefs, commitDigest, filterText],
  );
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: ROW_HEIGHT,
    key: dynamicRowHeightCacheKey,
  });
  const filteredRows = useMemo(
    () => buildFilteredGitGraphRows(rows, filterText, commitSearchBlobByHash),
    [commitSearchBlobByHash, rows, filterText],
  );
  const decorationChipSummaryByHash = useMemo(
    () => buildDecorationChipSummaryByHash(commits),
    [commits],
  );
  const maxLaneCount = useMemo(
    () => calculateGitGraphMaxLaneCount(rows),
    [rows],
  );
  const graphViewBoxWidth = useMemo(
    () => Math.max(1, liveGraphColWidthPx ?? graphColWidthPx),
    [graphColWidthPx, liveGraphColWidthPx],
  );
  const laneWidth = useMemo(
    () => graphViewBoxWidth / Math.max(1, maxLaneCount),
    [graphViewBoxWidth, maxLaneCount],
  );
  const palette = darkMode ? LANE_COLORS_DARK : LANE_COLORS_LIGHT;
  const commitRowProps = useMemo<GitCommitRowDataProps>(
    () => ({
      rows: filteredRows,
      selectedHash,
      palette,
      darkMode,
      graphViewBoxWidth,
      laneWidth,
      dynamicRowHeight,
      decorationChipSummaryByHash,
    }),
    [
      decorationChipSummaryByHash,
      darkMode,
      dynamicRowHeight,
      filteredRows,
      graphViewBoxWidth,
      laneWidth,
      palette,
      selectedHash,
    ],
  );

  return {
    dynamicRowHeight,
    commitRowProps,
    selectedCommit,
    isFilterActive: filterText.trim().length > 0,
    loadedCommitCount: commits.length,
  };
}

export function buildGitGraphFallbackColumnWidths({
  graphColWidthPx,
  authorColWidthPx,
  dateColWidthPx,
  hashColWidthPx,
}: {
  graphColWidthPx: number;
  authorColWidthPx: number;
  dateColWidthPx: number;
  hashColWidthPx: number;
}): GitGraphColumnWidths {
  return {
    graph: graphColWidthPx,
    author: authorColWidthPx,
    date: dateColWidthPx,
    hash: hashColWidthPx,
  };
}

export function useGitGraphOverlayModel(): GitGraphOverlayModel | null {
  const graphState = useGitStore((x) => x.graph);
  const {
    darkMode,
    splitPct,
    graphColWidthPx,
    authorColWidthPx,
    dateColWidthPx,
    hashColWidthPx,
  } = useGitGraphOverlayStorage();

  const listRef = useListRef(null);
  const overlayRef = useRef<HTMLElement | null>(null);
  const panesWrapperRef = useRef<HTMLDivElement | null>(null);
  const commitHeaderRef = useRef<HTMLDivElement | null>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const registerDragCleanup = useGitGraphDragCleanupRegistry();
  const requestPersistIfConnected = createGitGraphPersistRequest(overlayRef);
  const listSize = useGitGraphListSize(listWrapperRef);
  const [liveGraphColWidthPx, setLiveGraphColWidthPx] =
    useGitGraphLiveGraphColumnWidth(graphColWidthPx);
  useGitGraphOverlayStyleSync({
    overlayRef,
    splitPct,
    graphColWidthPx,
    authorColWidthPx,
    dateColWidthPx,
    hashColWidthPx,
  });
  const stateSlice = getGitGraphOverlayStateSlice(graphState);
  const { filterText, allRefs, repoRoot, headBranch } = stateSlice;
  const {
    dynamicRowHeight,
    commitRowProps,
    selectedCommit,
    isFilterActive,
    loadedCommitCount,
  } = useGitGraphOverlayComputedData({
    ...stateSlice,
    darkMode,
    graphColWidthPx,
    liveGraphColWidthPx,
  });

  if (!graphState) {
    return null;
  }
  const fallbackWidths = buildGitGraphFallbackColumnWidths({
    graphColWidthPx,
    authorColWidthPx,
    dateColWidthPx,
    hashColWidthPx,
  });
  const paneSplitDragArgs: GitGraphPaneSplitDragArgs = {
    overlayRef,
    panesWrapperRef,
    splitPct,
    registerDragCleanup,
    requestPersistIfConnected,
  };
  const columnResizeDragArgs: GitGraphColumnResizeDragArgs = {
    overlayRef,
    commitHeaderRef,
    fallbackWidths,
    registerDragCleanup,
    requestPersistIfConnected,
    setLiveGraphColWidthPx,
  };
  return {
    graphState,
    repoRoot,
    headBranch,
    filterText,
    allRefs,
    overlayRef,
    panesWrapperRef,
    commitHeaderRef,
    listWrapperRef,
    listRef,
    dynamicRowHeight,
    commitRowProps,
    listSize,
    isFilterActive,
    loadedCommitCount,
    selectedCommit,
    paneSplitDragArgs,
    columnResizeDragArgs,
  };
}

export function GitGraphOverlay({
  embedded = false,
  showCloseButton = true,
  extraHeaderActions = null,
  leftSidebar = null,
}: GitGraphOverlayProps) {
  const model = useGitGraphOverlayModel();
  if (!model) {
    return null;
  }
  return (
    <GitGraphOverlayView
      embedded={embedded}
      showCloseButton={showCloseButton}
      extraHeaderActions={extraHeaderActions}
      leftSidebar={leftSidebar}
      {...model}
    />
  );
}

export function GitGraphOverlayView({
  embedded,
  showCloseButton,
  extraHeaderActions,
  leftSidebar,
  graphState,
  repoRoot,
  headBranch,
  filterText,
  allRefs,
  overlayRef,
  panesWrapperRef,
  commitHeaderRef,
  listWrapperRef,
  listRef,
  dynamicRowHeight,
  commitRowProps,
  listSize,
  isFilterActive,
  loadedCommitCount,
  selectedCommit,
  paneSplitDragArgs,
  columnResizeDragArgs,
}: GitGraphOverlayProps & GitGraphOverlayModel) {
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
      <GitGraphOverlayHeader
        repoRoot={repoRoot}
        headBranch={headBranch}
        filterText={filterText}
        allRefs={allRefs}
        extraHeaderActions={extraHeaderActions}
        showCloseButton={showCloseButton}
      />

      {graphState.error ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {graphState.error}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1">
        {leftSidebar ? (
          <GitGraphOverlaySidebar>{leftSidebar}</GitGraphOverlaySidebar>
        ) : null}

        <div ref={panesWrapperRef} className="flex min-h-0 min-w-0 flex-1">
          <GitGraphHistoryPane
            graphState={graphState}
            filteredRows={commitRowProps.rows}
            listRef={listRef}
            dynamicRowHeight={dynamicRowHeight}
            commitRowProps={commitRowProps}
            listSize={listSize}
            listWrapperRef={listWrapperRef}
            commitHeaderRef={commitHeaderRef}
            isFilterActive={isFilterActive}
            loadedCommitCount={loadedCommitCount}
            onColumnResizePointerDown={(boundary, event) => {
              beginGitGraphColumnResizeDrag(
                boundary,
                event,
                columnResizeDragArgs,
              );
            }}
          />

          <GitGraphPaneSplitter
            onPointerDown={(event) => {
              beginGitGraphPaneSplitDrag(event, paneSplitDragArgs);
            }}
          />

          <GitGraphDiffPane
            graphState={graphState}
            selectedCommit={selectedCommit}
          />
        </div>
      </div>
    </section>
  );
}

export function GitGraphOverlayHeader({
  repoRoot,
  headBranch,
  filterText,
  allRefs,
  extraHeaderActions,
  showCloseButton,
}: {
  repoRoot: string | null;
  headBranch: string | null;
  filterText: string;
  allRefs: boolean;
  extraHeaderActions: ReactNode;
  showCloseButton: boolean;
}) {
  return (
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
          onChange={(e) => setGitGraphFilterText(e.target.value)}
        />
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
          onClick={() => void toggleGitGraphAllRefs()}
          aria-label={allRefs ? "Show current branch only" : "Show all refs"}
        >
          {allRefs ? "All refs" : "Branch"}
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
  );
}

export function GitGraphOverlaySidebar({ children }: { children: ReactNode }) {
  return (
    <aside
      data-testid="git-graph-left-sidebar"
      className="flex min-h-0 shrink-0 flex-col border-r border-setta-200 bg-setta-50/40 dark:border-setta-800 dark:bg-setta-900/30"
      style={{ width: "clamp(15rem, 24%, 20rem)" }}
    >
      {children}
    </aside>
  );
}

export function GitGraphHistoryPane({
  graphState,
  filteredRows,
  listRef,
  dynamicRowHeight,
  commitRowProps,
  listSize,
  listWrapperRef,
  commitHeaderRef,
  isFilterActive,
  loadedCommitCount,
  onColumnResizePointerDown,
}: {
  graphState: GitGraphOverlayState;
  filteredRows: GitGraphRow[];
  listRef: ReturnType<typeof useListRef>;
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
  commitRowProps: GitCommitRowDataProps;
  listSize: GitGraphOverlayListSize;
  listWrapperRef: RefObject<HTMLDivElement | null>;
  commitHeaderRef: RefObject<HTMLDivElement | null>;
  isFilterActive: boolean;
  loadedCommitCount: number;
  onColumnResizePointerDown: (
    boundary: GitGraphColumnBoundary,
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
}) {
  return (
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
              onColumnResizePointerDown("graphMessage", event)
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
              onColumnResizePointerDown("messageAuthor", event)
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
              onColumnResizePointerDown("authorDate", event)
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
              onColumnResizePointerDown("dateHash", event)
            }
          />
          <span>Hash</span>
        </div>
      </div>
      <div
        data-testid="git-graph-commit-list-wrapper"
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        ref={listWrapperRef}
      >
        {graphState.isLoading ? (
          <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
            Loading commits…
          </div>
        ) : (
          <List
            listRef={listRef}
            rowComponent={GitCommitRow}
            rowCount={filteredRows.length}
            rowHeight={dynamicRowHeight}
            className="nodrag"
            onRowsRendered={(visibleRows) => {
              if (
                !shouldLoadMoreGitGraphCommits({
                  graphState,
                  filteredRowCount: filteredRows.length,
                  stopIndex: visibleRows.stopIndex,
                  isFilterActive,
                })
              ) {
                return;
              }
              void loadMoreGitGraphCommits();
            }}
            rowProps={commitRowProps}
            style={{
              height: listSize.height,
              width: listSize.width,
              overflowX: "hidden",
            }}
          />
        )}
      </div>
      {!graphState.isLoading && (
        <div
          data-testid="git-graph-load-more-status"
          className="min-h-[24px] border-t border-setta-200/70 px-3 py-1 text-[11px] text-setta-500 dark:border-setta-800/70 dark:text-setta-400"
        >
          <GitGraphLoadMoreStatus
            graphState={graphState}
            isFilterActive={isFilterActive}
            loadedCommitCount={loadedCommitCount}
          />
        </div>
      )}
    </section>
  );
}

export function GitGraphLoadMoreStatus({
  graphState,
  isFilterActive,
  loadedCommitCount,
}: {
  graphState: GitGraphOverlayState;
  isFilterActive: boolean;
  loadedCommitCount: number;
}) {
  if (graphState.loadMoreError) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{graphState.loadMoreError}</span>
        <button
          type="button"
          data-testid="git-graph-load-more-retry"
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
          onClick={() => void loadMoreGitGraphCommits({ force: true })}
        >
          Retry
        </button>
      </div>
    );
  }
  if (graphState.isLoadingMore) {
    return <span>Loading more commits…</span>;
  }
  if (isFilterActive) {
    return <span>Filtering loaded commits only.</span>;
  }
  if (loadedCommitCount === 0 && !graphState.error) {
    return <span>No commits yet on this ref.</span>;
  }
  if (graphState.isCapped) {
    return (
      <span>
        Showing first {loadedCommitCount.toLocaleString()} commits (cap
        reached).
      </span>
    );
  }
  if (!graphState.hasMore && loadedCommitCount > 0) {
    return <span>Start of history reached.</span>;
  }
  return <span className="opacity-0">.</span>;
}

export function GitGraphPaneSplitter({
  onPointerDown,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-testid="git-graph-pane-splitter"
      role="separator"
      aria-label="Resize git graph panes"
      className="group/resize relative w-3 cursor-col-resize bg-transparent"
      onPointerDown={onPointerDown}
    >
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
    </div>
  );
}

export function GitGraphDiffPane({
  graphState,
  selectedCommit,
}: {
  graphState: GitGraphOverlayState;
  selectedCommit: Commit | null;
}) {
  return (
    <section
      data-testid="git-graph-diff-pane"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ minWidth: `${GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX}px` }}
    >
      <div className="border-b border-setta-200/70 px-3 py-2 dark:border-setta-800/70">
        <GitGraphDiffPaneHeader
          selectedCommit={selectedCommit}
          selectedCommitFilePath={graphState.selectedCommitFilePath}
        />
      </div>

      <GitGraphDiffPaneWarnings
        graphState={graphState}
        selectedCommit={selectedCommit}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <GitGraphDiffPaneBody
          graphState={graphState}
          selectedCommit={selectedCommit}
        />
      </div>
    </section>
  );
}

export function GitGraphDiffPaneHeader({
  selectedCommit,
  selectedCommitFilePath,
}: {
  selectedCommit: Commit | null;
  selectedCommitFilePath: string | null;
}) {
  if (!selectedCommit) {
    return (
      <div className="text-xs text-setta-500 dark:text-setta-300">
        Select a commit to view details.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-setta-900 dark:text-setta-50">
            {selectedCommit.subject}
          </div>
          <div className="truncate text-[11px] text-setta-500 dark:text-setta-400">
            {selectedCommit.authorName} ·{" "}
            {DATE_FORMATTER.format(new Date(selectedCommit.authorTimeMs))} ·{" "}
            {selectedCommit.hash.slice(0, 8)}
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
      <GitGraphSelectedCommitDecorations
        decorations={selectedCommit.decorations ?? []}
      />
    </div>
  );
}

export function GitGraphSelectedCommitDecorations({
  decorations,
}: {
  decorations: readonly string[];
}) {
  if (decorations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {decorations.slice(0, 6).map((decoration) => (
        <span
          key={decoration}
          className="rounded-full border border-setta-200 bg-setta-50 px-2 py-0.5 text-[10px] font-semibold text-setta-600 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300"
        >
          {decoration}
        </span>
      ))}
    </div>
  );
}

export function GitGraphDiffPaneWarnings({
  graphState,
  selectedCommit,
}: {
  graphState: GitGraphOverlayState;
  selectedCommit: Commit | null;
}) {
  return (
    <>
      {selectedCommit &&
      graphState.selectedCommitFileDiffResponse?.isTruncated ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Diff output truncated for performance.
        </div>
      ) : null}

      {selectedCommit && graphState.selectedCommitDetails?.isTruncated ? (
        <div
          data-testid="git-graph-commit-details-truncated-warning"
          className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          Commit details were truncated. The changed-file list may be
          incomplete.
        </div>
      ) : null}

      {selectedCommit && graphState.selectedCommitFileDiffError ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {graphState.selectedCommitFileDiffError}
        </div>
      ) : null}
    </>
  );
}

export function GitGraphDiffPaneBody({
  graphState,
  selectedCommit,
}: {
  graphState: GitGraphOverlayState;
  selectedCommit: Commit | null;
}) {
  if (!selectedCommit) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
        Select a commit to view details.
      </div>
    );
  }
  if (graphState.selectedCommitFileDiffIsLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
        Loading file diff…
      </div>
    );
  }
  if (graphState.selectedCommitFileDiffResponse?.diff) {
    return (
      <GitDiffCodeMirror
        value={graphState.selectedCommitFileDiffResponse.diff}
        filePathForLanguage={graphState.selectedCommitFilePath}
        height="100%"
        className="h-full min-h-0 w-full min-w-0 [&_.cm-content]:text-[11px] [&_.cm-content]:leading-[16px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
      Select a file to view its diff.
    </div>
  );
}

export type GitCommitRowDataProps = {
  rows: GitGraphRow[];
  selectedHash: string | null;
  palette: readonly string[];
  darkMode: boolean;
  graphViewBoxWidth: number;
  laneWidth: number;
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
  decorationChipSummaryByHash: Map<string, DecorationChipSummary>;
};

export type GitCommitRowProps = RowComponentProps<GitCommitRowDataProps>;
