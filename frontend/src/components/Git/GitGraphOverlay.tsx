import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { List, useListRef } from "react-window";
import {
  closeGitOverlay,
  refreshGitGraphOverlay,
  selectGitCommit,
  setGitGraphFilterText,
  toggleGitGraphAllRefs,
} from "state/actions/git";
import { useLocalStorage } from "state/definitions";
import { useGitStore } from "state/git";
import type { GitGraphRow } from "utils/gitGraph";

const ROW_HEIGHT = 28;
const GRAPH_CELL_WIDTH = 120;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const LANE_COLORS_LIGHT = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#0ea5e9",
  "#ca8a04",
  "#0891b2",
];

const LANE_COLORS_DARK = [
  "#60a5fa",
  "#4ade80",
  "#f87171",
  "#fb7185",
  "#c4b5fd",
  "#38bdf8",
  "#facc15",
  "#22d3ee",
];

export function GitGraphOverlay() {
  const graphState = useGitStore((x) =>
    x.overlay.kind === "graph" ? x.overlay.graph : null,
  );
  const darkMode = useLocalStorage((x) => x.darkMode);

  const listRef = useListRef();
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const [listSize, setListSize] = useState({ height: 320, width: 320 });

  useEffect(() => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setListSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  const rows = graphState?.rows ?? [];
  const filterText = graphState?.filterText ?? "";
  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      const c = row.commit;
      if (c.hash.toLowerCase().includes(q)) {
        return true;
      }
      if (c.subject.toLowerCase().includes(q)) {
        return true;
      }
      if (c.authorName.toLowerCase().includes(q)) {
        return true;
      }
      if (c.decorations.some((d) => d.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [rows, filterText]);

  if (!graphState) {
    return null;
  }

  const repoRoot = graphState.response?.repoRoot ?? null;
  const headBranch = graphState.response?.headBranch ?? null;
  const selectedCommit = graphState.selectedCommitHash
    ? graphState.response?.commits.find(
        (c) => c.hash === graphState.selectedCommitHash,
      ) ?? null
    : null;

  const palette = darkMode ? LANE_COLORS_DARK : LANE_COLORS_LIGHT;

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border border-setta-200 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-950">
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
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
            onClick={closeGitOverlay}
          >
            Close
          </button>
        </div>
      </header>

      {graphState.error && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {graphState.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-h-0 w-[56%] min-w-[320px] flex-col border-r border-setta-200 dark:border-setta-800">
          <div className="grid grid-cols-[120px_1fr_120px_110px_84px] gap-2 border-b border-setta-200/70 bg-setta-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:border-setta-800/70 dark:bg-setta-900 dark:text-setta-500">
            <div>Graph</div>
            <div>Message</div>
            <div>Author</div>
            <div>Date</div>
            <div>Hash</div>
          </div>
          <div className="min-h-0 flex-1" ref={listWrapperRef}>
            {graphState.isLoading ? (
              <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
                Loading commits…
              </div>
            ) : (
              <List
                listRef={listRef}
                rowComponent={GitCommitRow}
                rowCount={filteredRows.length}
                rowHeight={ROW_HEIGHT}
                className="nodrag"
                rowProps={{
                  rows: filteredRows,
                  selectedHash: graphState.selectedCommitHash,
                  palette,
                }}
                style={{ height: listSize.height, width: listSize.width }}
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                      {DATE_FORMATTER.format(
                        new Date(selectedCommit.authorTimeMs),
                      )}{" "}
                      · {selectedCommit.hash.slice(0, 8)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
                    onClick={() => void selectGitCommit(selectedCommit.hash)}
                  >
                    Reload diff
                  </button>
                </div>
                {selectedCommit.decorations.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCommit.decorations.slice(0, 6).map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-setta-200 bg-setta-50 px-2 py-0.5 text-[10px] font-semibold text-setta-600 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-setta-500 dark:text-setta-300">
                Select a commit to view details.
              </div>
            )}
          </div>

          {graphState.selectedCommitError && (
            <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {graphState.selectedCommitError}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {graphState.selectedCommitIsLoading ? (
              <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
                Loading commit diff…
              </div>
            ) : graphState.selectedCommitResponse?.diff ? (
              <GitDiffCodeMirror
                value={graphState.selectedCommitResponse.diff}
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
      </div>
    </section>
  );
}

type GitCommitRowProps = {
  index: number;
  style: Record<string, unknown>;
  rows: GitGraphRow[];
  selectedHash: string | null;
  palette: string[];
};

function GitCommitRow({
  index,
  style,
  rows,
  selectedHash,
  palette,
}: GitCommitRowProps) {
  const row = rows[index];
  if (!row) {
    return null;
  }
  const commit = row.commit;
  const isSelected = commit.hash === selectedHash;
  const date = DATE_FORMATTER.format(new Date(commit.authorTimeMs));
  const shortHash = commit.hash.slice(0, 8);
  const laneCount = row.laneColorIds.length;

  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "bg-transparent hover:bg-setta-50 dark:hover:bg-setta-900/60";

  return (
    <button
      type="button"
      className={`grid w-full grid-cols-[120px_1fr_120px_110px_84px] items-center gap-2 px-3 text-left text-xs text-setta-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-100 ${background}`}
      style={style as never}
      onClick={() => void selectGitCommit(commit.hash)}
    >
      <div className="flex items-center">
        <GitGraphCell
          laneIndex={row.laneIndex}
          laneColorIds={row.laneColorIds}
          mergeToLaneIndices={row.mergeToLaneIndices}
          palette={palette}
        />
      </div>
      <div className="min-w-0 truncate">{commit.subject}</div>
      <div className="min-w-0 truncate text-setta-500 dark:text-setta-400">
        {commit.authorName}
      </div>
      <div className="min-w-0 truncate text-setta-500 dark:text-setta-400">
        {date}
      </div>
      <div className="min-w-0 truncate font-mono text-[11px] text-setta-500 dark:text-setta-400">
        {shortHash}
      </div>
      <span className="sr-only">lanes {laneCount}</span>
    </button>
  );
}

function GitGraphCell({
  laneIndex,
  laneColorIds,
  mergeToLaneIndices,
  palette,
}: {
  laneIndex: number;
  laneColorIds: number[];
  mergeToLaneIndices: number[];
  palette: string[];
}) {
  const laneWidth = 12;
  const height = ROW_HEIGHT;
  const width = Math.max(GRAPH_CELL_WIDTH, laneColorIds.length * laneWidth);
  const centerY = height / 2;
  const xForLane = (idx: number) => idx * laneWidth + laneWidth / 2;

  const commitColorId = laneColorIds[laneIndex] ?? 0;
  const commitColor = palette[commitColorId % palette.length]!;

  return (
    <svg
      width={GRAPH_CELL_WIDTH}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      aria-hidden="true"
    >
      {laneColorIds.map((colorId, idx) => {
        const x = xForLane(idx);
        const color = palette[colorId % palette.length]!;
        return (
          <line
            key={`lane-${idx}`}
            x1={x}
            x2={x}
            y1={0}
            y2={height}
            stroke={color}
            strokeWidth={2}
            opacity={0.35}
          />
        );
      })}

      {mergeToLaneIndices.map((toIdx) => {
        const x1 = xForLane(laneIndex);
        const x2 = xForLane(toIdx);
        return (
          <line
            key={`merge-${laneIndex}-${toIdx}`}
            x1={x1}
            x2={x2}
            y1={centerY}
            y2={centerY}
            stroke={commitColor}
            strokeWidth={2}
            opacity={0.6}
          />
        );
      })}

      <circle
        cx={xForLane(laneIndex)}
        cy={centerY}
        r={3.25}
        fill={commitColor}
      />
    </svg>
  );
}
