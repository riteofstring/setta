import { useEffect, useMemo, useRef, useState } from "react";
import {
  List,
  useDynamicRowHeight,
  useListRef,
  type RowComponentProps,
} from "react-window";
import { loadMoreGitGraphCommits } from "state/actions/gitGraphPaginationRequests";
import {
  clearGitGraphSelectedCommit,
  selectGitCommit,
} from "state/actions/gitGraphSelection";
import type { GitCommit } from "utils/generatedTypes";
import type { GitGraphRow } from "utils/gitGraph";
import {
  buildGitCommitSearchBlob,
  buildGitGraphCommitDigest,
  buildGitGraphDecorationChipSummaryByHash,
  buildGitGraphRowHeightCacheKey,
  summarizeDecorationChips,
  type GitGraphDecorationChip,
  type GitGraphDecorationChipSummary,
} from "./gitGraphOverlayCommitIndex";
import { COMMIT_GRID_TEMPLATE_COLUMNS } from "./gitGraphOverlayResizeModel";
import { GitGraphOverlaySelectedCommitDetails } from "./gitGraphOverlaySelectedCommitPane";

// GitGraphOverlayCommitListSurface owns the virtualized history pane rows,
// pagination status, and lane/decoration rendering for each commit entry.

const ROW_HEIGHT = 28;
const LOAD_MORE_THRESHOLD_ROWS = 40;
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

const GOLDEN_ANGLE_DEG = 137.508;
const GENERATED_LANE_COLORS_LIGHT = new Map<number, string>();
const GENERATED_LANE_COLORS_DARK = new Map<number, string>();

export type GitGraphOverlayCommitListSurfaceProps = {
  rows: GitGraphRow[];
  commits: readonly GitCommit[];
  filterText: string;
  allRefs: boolean;
  selectedCommitHash: string | null;
  darkMode: boolean;
  graphViewBoxWidth: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  hasMore: boolean;
  nextOffset: number | null;
  isCapped: boolean;
  error: string | null;
};

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function hexByte(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function hslToRgb(
  hueDeg: number,
  s: number,
  l: number,
): [number, number, number] {
  const hueNormalized = ((hueDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hueNormalized / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hueNormalized < 60) {
    r1 = c;
    g1 = x;
  } else if (hueNormalized < 120) {
    r1 = x;
    g1 = c;
  } else if (hueNormalized < 180) {
    g1 = c;
    b1 = x;
  } else if (hueNormalized < 240) {
    g1 = x;
    b1 = c;
  } else if (hueNormalized < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function generatedLaneColor(colorId: number, darkMode: boolean): string {
  const cache = darkMode
    ? GENERATED_LANE_COLORS_DARK
    : GENERATED_LANE_COLORS_LIGHT;
  const cached = cache.get(colorId);
  if (cached) {
    return cached;
  }

  // Golden-angle hues distribute colors evenly without repeating.
  const hue = (30 + colorId * GOLDEN_ANGLE_DEG) % 360;
  const saturation = darkMode ? 0.72 : 0.78;
  const lightnessBase = darkMode ? 0.66 : 0.44;
  const lightness = lightnessBase + (colorId % 2 === 0 ? -0.04 : 0.04);
  const [r, g, b] = hslToRgb(
    hue,
    saturation,
    Math.min(0.78, Math.max(0.3, lightness)),
  );
  const color = hexFromRgb(r, g, b);

  cache.set(colorId, color);
  return color;
}

function laneColorForId(
  colorId: number,
  palette: readonly string[],
  darkMode: boolean,
): string {
  if (colorId < palette.length) {
    return palette[colorId] ?? palette[0] ?? "#000000";
  }
  return generatedLaneColor(colorId, darkMode);
}

function rgbFromHex(hex: string): [number, number, number] | null {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) {
    return null;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = rgbFromHex(hex);
  if (!rgb) {
    return hex;
  }
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GitGraphOverlayCommitListSurface({
  rows,
  commits,
  filterText,
  allRefs,
  selectedCommitHash,
  darkMode,
  graphViewBoxWidth,
  isLoading,
  isLoadingMore,
  loadMoreError,
  hasMore,
  nextOffset,
  isCapped,
  error,
}: GitGraphOverlayCommitListSurfaceProps) {
  const listRef = useListRef(null);
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

  const commitSearchBlobByHash = useMemo(() => {
    const byHash = new Map<string, string>();
    for (const commit of commits) {
      byHash.set(commit.hash, buildGitCommitSearchBlob(commit));
    }
    return byHash;
  }, [commits]);

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      const blob =
        commitSearchBlobByHash.get(row.commit.hash) ??
        buildGitCommitSearchBlob(row.commit);
      return blob.includes(q);
    });
  }, [commitSearchBlobByHash, filterText, rows]);

  const decorationChipSummaryByHash = useMemo(() => {
    return buildGitGraphDecorationChipSummaryByHash(commits);
  }, [commits]);

  const commitDigest = useMemo(() => {
    return buildGitGraphCommitDigest(commits);
  }, [commits]);

  const dynamicRowHeightCacheKey = useMemo(() => {
    return buildGitGraphRowHeightCacheKey({
      commitDigest,
      allRefs,
      filterText,
    });
  }, [allRefs, commitDigest, filterText]);

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: ROW_HEIGHT,
    key: dynamicRowHeightCacheKey,
  });

  const maxLaneCount = useMemo(() => {
    return rows.reduce(
      (maxCount, row) => Math.max(maxCount, row.laneColorIds.length),
      1,
    );
  }, [rows]);

  const laneWidth = useMemo(() => {
    return graphViewBoxWidth / Math.max(1, maxLaneCount);
  }, [graphViewBoxWidth, maxLaneCount]);

  const palette = darkMode ? LANE_COLORS_DARK : LANE_COLORS_LIGHT;
  const commitRowProps = useMemo<GitCommitRowDataProps>(
    () => ({
      rows: filteredRows,
      selectedHash: selectedCommitHash,
      palette,
      darkMode,
      graphViewBoxWidth,
      laneWidth,
      dynamicRowHeight,
      decorationChipSummaryByHash,
    }),
    [
      darkMode,
      decorationChipSummaryByHash,
      dynamicRowHeight,
      filteredRows,
      graphViewBoxWidth,
      laneWidth,
      palette,
      selectedCommitHash,
    ],
  );

  const isFilterActive = filterText.trim().length > 0;
  const loadedCommitCount = commits.length;

  return (
    <>
      <div
        data-testid="git-graph-commit-list-wrapper"
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        ref={listWrapperRef}
      >
        {isLoading ? (
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
                isLoading ||
                isLoadingMore ||
                loadMoreError !== null ||
                nextOffset === null ||
                !hasMore ||
                isFilterActive
              ) {
                return;
              }
              const remaining = filteredRows.length - 1 - visibleRows.stopIndex;
              if (remaining <= LOAD_MORE_THRESHOLD_ROWS) {
                void loadMoreGitGraphCommits();
              }
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
      {!isLoading && (
        <div
          data-testid="git-graph-load-more-status"
          className="min-h-[24px] border-t border-setta-200/70 px-3 py-1 text-[11px] text-setta-500 dark:border-setta-800/70 dark:text-setta-400"
        >
          {loadMoreError ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{loadMoreError}</span>
              <button
                type="button"
                data-testid="git-graph-load-more-retry"
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
                onClick={() => void loadMoreGitGraphCommits({ force: true })}
              >
                Retry
              </button>
            </div>
          ) : isLoadingMore ? (
            <span>Loading more commits…</span>
          ) : isFilterActive ? (
            <span>Filtering loaded commits only.</span>
          ) : loadedCommitCount === 0 && !error ? (
            <span>No commits yet on this ref.</span>
          ) : isCapped ? (
            <span>
              Showing first {loadedCommitCount.toLocaleString()} commits (cap
              reached).
            </span>
          ) : !hasMore && loadedCommitCount > 0 ? (
            <span>Start of history reached.</span>
          ) : (
            <span className="opacity-0">.</span>
          )}
        </div>
      )}
    </>
  );
}

type GitCommitRowDataProps = {
  rows: GitGraphRow[];
  selectedHash: string | null;
  palette: readonly string[];
  darkMode: boolean;
  graphViewBoxWidth: number;
  laneWidth: number;
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
  decorationChipSummaryByHash: Map<string, GitGraphDecorationChipSummary>;
};

type GitCommitRowProps = RowComponentProps<GitCommitRowDataProps>;

function GitCommitRow({
  index,
  style,
  rows,
  selectedHash,
  palette,
  darkMode,
  graphViewBoxWidth,
  laneWidth,
  dynamicRowHeight,
  decorationChipSummaryByHash,
}: GitCommitRowProps) {
  const row = rows[index];
  if (!row) {
    return null;
  }

  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = rowRef.current;
    if (!element) {
      return;
    }
    return dynamicRowHeight.observeRowElements([element]);
  }, [dynamicRowHeight]);

  const commit = row.commit;
  const isSelected = commit.hash === selectedHash;
  const date = DATE_FORMATTER.format(new Date(commit.authorTimeMs));
  const shortHash = commit.hash.slice(0, 8);
  const laneCount = row.laneColorIds.reduce(
    (count, colorId) => (colorId >= 0 ? count + 1 : count),
    0,
  );
  const rawCommitColorId = row.laneColorIds[row.laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);
  const decorationSummary =
    decorationChipSummaryByHash.get(commit.hash) ??
    summarizeDecorationChips(commit.decorations);
  const chips = decorationSummary.chips;
  const extraChipCount = decorationSummary.extraChipCount;
  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "bg-transparent hover:bg-setta-50 dark:hover:bg-setta-900/60";

  return (
    <div
      style={style}
      ref={rowRef}
      data-react-window-index={index}
      className="w-full"
    >
      <button
        type="button"
        data-testid="git-graph-row"
        data-commit-hash={commit.hash}
        className={`grid h-[28px] w-full items-center gap-2 px-3 text-left text-xs text-setta-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-100 ${background}`}
        style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
        onClick={() => {
          if (isSelected) {
            clearGitGraphSelectedCommit();
            return;
          }
          void selectGitCommit(commit.hash);
        }}
      >
        <div className="flex items-center">
          <GitGraphCell
            laneIndex={row.laneIndex}
            laneColorIds={row.laneColorIds}
            laneStartIndices={row.laneStartIndices}
            laneEndIndices={row.laneEndIndices}
            joinFromLaneIndices={row.joinFromLaneIndices}
            mergeToLaneIndices={row.mergeToLaneIndices}
            palette={palette}
            darkMode={darkMode}
            viewBoxWidth={graphViewBoxWidth}
            laneWidth={laneWidth}
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {chips.map((chip) => (
              <DecorationPill
                key={`${chip.kind}-${chip.label}`}
                chip={chip}
                laneColor={commitColor}
              />
            ))}
            {extraChipCount > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-setta-200 bg-setta-50 px-2 py-0.5 text-[10px] font-semibold text-setta-600 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300">
                +{extraChipCount}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
          </div>
        </div>
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

      {isSelected && (
        <div className="border-b border-setta-200/70 bg-setta-50/60 px-3 dark:border-setta-800/70 dark:bg-setta-900/20">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
          >
            <ExpandedGraphGutter
              laneColorIds={row.laneColorIds}
              laneEndIndices={row.laneEndIndices}
              joinFromLaneIndices={row.joinFromLaneIndices}
              palette={palette}
              darkMode={darkMode}
              viewBoxWidth={graphViewBoxWidth}
              laneWidth={laneWidth}
            />
            <div className="col-span-4 min-w-0 py-3">
              <GitGraphOverlaySelectedCommitDetails commitHash={commit.hash} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandedGraphGutter({
  laneColorIds,
  laneEndIndices,
  joinFromLaneIndices,
  palette,
  darkMode,
  viewBoxWidth,
  laneWidth,
}: {
  laneColorIds: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  palette: readonly string[];
  darkMode: boolean;
  viewBoxWidth: number;
  laneWidth: number;
}) {
  const blockedLaneIndices = new Set<number>([
    ...laneEndIndices,
    ...joinFromLaneIndices,
  ]);
  const normalizedLaneWidth = Math.max(1, laneWidth);
  const xForLane = (idx: number) =>
    Math.round(idx * normalizedLaneWidth + normalizedLaneWidth / 2);
  const normalizedWidth = Math.max(1, viewBoxWidth);

  return (
    <div
      data-testid="git-graph-expanded-gutter"
      className="pointer-events-none relative min-h-[52px]"
      aria-hidden="true"
    >
      {laneColorIds.map((colorId, idx) => {
        if (colorId < 0 || blockedLaneIndices.has(idx)) {
          return null;
        }
        const color = laneColorForId(colorId, palette, darkMode);
        const leftPct = (xForLane(idx) / normalizedWidth) * 100;
        return (
          <span
            key={`expanded-lane-${idx}`}
            className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 rounded-full"
            style={{ left: `${leftPct}%`, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

function DecorationPill({
  chip,
  laneColor,
}: {
  chip: GitGraphDecorationChip;
  laneColor: string;
}) {
  const base =
    "inline-flex shrink-0 max-w-[160px] items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold";

  if (
    chip.kind === "head" ||
    chip.kind === "branch" ||
    chip.kind === "remote" ||
    chip.kind === "symbolic"
  ) {
    return (
      <span
        className={base}
        data-decoration-kind={chip.kind}
        style={{
          borderColor: rgbaFromHex(laneColor, 0.6),
          backgroundColor: rgbaFromHex(laneColor, 0.12),
          color: laneColor,
        }}
        title={chip.label}
      >
        {chip.label}
      </span>
    );
  }

  if (chip.kind === "tag") {
    return (
      <span
        className={`${base} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200`}
        data-decoration-kind={chip.kind}
        title={chip.label}
      >
        {chip.label}
      </span>
    );
  }

  return (
    <span
      className={`${base} border-setta-200 bg-white text-setta-700 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-200`}
      data-decoration-kind={chip.kind}
      title={chip.label}
    >
      {chip.label}
    </span>
  );
}

function GitGraphCell({
  laneIndex,
  laneColorIds,
  laneStartIndices,
  laneEndIndices,
  joinFromLaneIndices,
  mergeToLaneIndices,
  palette,
  darkMode,
  viewBoxWidth,
  laneWidth,
}: {
  laneIndex: number;
  laneColorIds: number[];
  laneStartIndices: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  mergeToLaneIndices: number[];
  palette: readonly string[];
  darkMode: boolean;
  viewBoxWidth: number;
  laneWidth: number;
}) {
  const height = ROW_HEIGHT;
  const width = Math.max(1, viewBoxWidth);
  const centerY = height / 2;
  // Keep strokes fully opaque so curves don't blend with underlying lanes and
  // appear to change color when crossing other branches.
  const strokeOpacity = 1;
  const normalizedLaneWidth = Math.max(1, laneWidth);
  const xForLane = (idx: number) =>
    Math.round(idx * normalizedLaneWidth + normalizedLaneWidth / 2);

  const rawCommitColorId = laneColorIds[laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);
  const laneStartSet = new Set(laneStartIndices);
  const laneEndSet = new Set(laneEndIndices);
  const joinFromSet = new Set(joinFromLaneIndices);
  const mergeToSet = new Set(mergeToLaneIndices);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
      aria-hidden="true"
    >
      {laneColorIds.map((colorId, idx) => {
        if (colorId < 0) {
          return null;
        }
        let y1 = laneStartSet.has(idx) ? centerY : 0;
        let y2 = laneEndSet.has(idx) ? centerY : height;
        if (joinFromSet.has(idx)) {
          y1 = Math.max(y1, centerY);
        }
        if (mergeToSet.has(idx) && laneStartSet.has(idx)) {
          y2 = Math.min(y2, centerY);
        }
        if (y1 === y2) {
          return null;
        }
        const x = xForLane(idx);
        const color = laneColorForId(colorId, palette, darkMode);
        return (
          <line
            key={`lane-${idx}`}
            x1={x}
            x2={x}
            y1={y1}
            y2={y2}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={strokeOpacity}
          />
        );
      })}

      {joinFromLaneIndices.map((fromIdx) => {
        const x1 = xForLane(fromIdx);
        const x2 = xForLane(laneIndex);
        const controlY = centerY / 2;
        const fromColorIdRaw = laneColorIds[fromIdx] ?? commitColorId;
        const fromColorId =
          fromColorIdRaw < 0 ? commitColorId : clampNonNegative(fromColorIdRaw);
        const fromColor = laneColorForId(fromColorId, palette, darkMode);
        return (
          <path
            key={`join-${fromIdx}-to-${laneIndex}`}
            d={`M ${x1} 0 C ${x1} ${controlY} ${x2} ${controlY} ${x2} ${centerY}`}
            stroke={fromColor}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={strokeOpacity}
          />
        );
      })}

      {mergeToLaneIndices.map((toIdx) => {
        const x1 = xForLane(laneIndex);
        const x2 = xForLane(toIdx);
        const controlY = (centerY + height) / 2;
        const toColorIdRaw = laneColorIds[toIdx] ?? commitColorId;
        const toColorId =
          toColorIdRaw < 0 ? commitColorId : clampNonNegative(toColorIdRaw);
        const toColor = laneColorForId(toColorId, palette, darkMode);
        return (
          <path
            key={`merge-${laneIndex}-${toIdx}`}
            d={`M ${x1} ${centerY} C ${x1} ${controlY} ${x2} ${controlY} ${x2} ${height}`}
            stroke={toColor}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={strokeOpacity}
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
