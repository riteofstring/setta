import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { List, useDynamicRowHeight, useListRef } from "react-window";
import {
  clearGitGraphSelectedCommit,
  closeGitOverlay,
  refreshGitGraphOverlay,
  selectGitCommit,
  selectGitCommitFile,
  setGitGraphFilterText,
  toggleGitGraphAllRefs,
} from "state/actions/git";
import { useLocalStorage } from "state/definitions";
import { useGitStore } from "state/git";
import type { GitGraphRow } from "utils/gitGraph";
import type { GetGitCommitDetailsResponse, GitCommitChangedFile } from "utils/generatedTypes";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 12;
const MAX_ROW_DECORATIONS = 3;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const DEFAULT_GIT_GRAPH_SPLIT_PCT = 56;

const GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX = 320;
const GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX = 360;

const GRAPH_COL_MIN_WIDTH_PX = 80;
const GRAPH_COL_MAX_WIDTH_PX = 240;
const AUTHOR_COL_MIN_WIDTH_PX = 90;
const AUTHOR_COL_MAX_WIDTH_PX = 260;
const DATE_COL_MIN_WIDTH_PX = 90;
const DATE_COL_MAX_WIDTH_PX = 220;
const HASH_COL_MIN_WIDTH_PX = 70;
const HASH_COL_MAX_WIDTH_PX = 160;

const CSS_VAR_GIT_GRAPH_SPLIT_PCT = "--git-graph-split-pct";
const CSS_VAR_GIT_GRAPH_COL_GRAPH = "--git-graph-col-graph";
const CSS_VAR_GIT_GRAPH_COL_AUTHOR = "--git-graph-col-author";
const CSS_VAR_GIT_GRAPH_COL_DATE = "--git-graph-col-date";
const CSS_VAR_GIT_GRAPH_COL_HASH = "--git-graph-col-hash";

const COMMIT_GRID_TEMPLATE_COLUMNS = `var(${CSS_VAR_GIT_GRAPH_COL_GRAPH}, 120px) minmax(0, 1fr) var(${CSS_VAR_GIT_GRAPH_COL_AUTHOR}, 120px) var(${CSS_VAR_GIT_GRAPH_COL_DATE}, 110px) var(${CSS_VAR_GIT_GRAPH_COL_HASH}, 84px)`;

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

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

type DecorationKind =
  | "head"
  | "branch"
  | "remote"
  | "tag"
  | "symbolic"
  | "other";

type DecorationChip = {
  label: string;
  kind: DecorationKind;
};

const DECORATION_KIND_PRIORITY: Record<DecorationKind, number> = {
  head: 0,
  branch: 1,
  remote: 2,
  tag: 3,
  symbolic: 4,
  other: 5,
};

function parseDecorationChip(raw: string): DecorationChip | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  if (text.startsWith("HEAD -> ")) {
    const branch = text.slice("HEAD -> ".length).trim();
    if (!branch) {
      return null;
    }
    return { label: branch, kind: "head" };
  }
  if (text.startsWith("tag: ")) {
    const tag = text.slice("tag: ".length).trim();
    if (!tag) {
      return null;
    }
    return { label: tag, kind: "tag" };
  }
  const arrowIdx = text.indexOf(" -> ");
  if (arrowIdx !== -1) {
    const left = text.slice(0, arrowIdx).trim();
    if (!left) {
      return null;
    }
    return { label: left, kind: "symbolic" };
  }
  if (text.startsWith("origin/")) {
    return { label: text, kind: "remote" };
  }
  return { label: text, kind: "branch" };
}

export function GitGraphOverlay() {
  const graphState = useGitStore((x) =>
    x.overlay.kind === "graph" ? x.overlay.graph : null,
  );
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

  const listRef = useListRef();
  const overlayRef = useRef<HTMLElement | null>(null);
  const panesWrapperRef = useRef<HTMLDivElement | null>(null);
  const historyPaneRef = useRef<HTMLElement | null>(null);
  const commitHeaderRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) {
      return;
    }
    el.style.setProperty(
      CSS_VAR_GIT_GRAPH_SPLIT_PCT,
      clamp(splitPct, 0, 100).toString(),
    );
    el.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_GRAPH,
      `${clamp(
        graphColWidthPx,
        GRAPH_COL_MIN_WIDTH_PX,
        GRAPH_COL_MAX_WIDTH_PX,
      )}px`,
    );
    el.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_AUTHOR,
      `${clamp(
        authorColWidthPx,
        AUTHOR_COL_MIN_WIDTH_PX,
        AUTHOR_COL_MAX_WIDTH_PX,
      )}px`,
    );
    el.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_DATE,
      `${clamp(
        dateColWidthPx,
        DATE_COL_MIN_WIDTH_PX,
        DATE_COL_MAX_WIDTH_PX,
      )}px`,
    );
    el.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_HASH,
      `${clamp(hashColWidthPx, HASH_COL_MIN_WIDTH_PX, HASH_COL_MAX_WIDTH_PX)}px`,
    );
  }, [
    authorColWidthPx,
    dateColWidthPx,
    graphColWidthPx,
    hashColWidthPx,
    splitPct,
  ]);

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
  const graphViewBoxWidth = useMemo(() => {
    // Keep the SVG viewBox width consistent across rows so lane x positions
    // don't rescale row-to-row as the lane count changes (which causes
    // "disconnected" looking lines at row boundaries).
    const maxLaneCount = rows.reduce(
      (maxCount, row) => Math.max(maxCount, row.laneColorIds.length),
      1,
    );
    return Math.max(graphColWidthPx, maxLaneCount * LANE_WIDTH);
  }, [graphColWidthPx, rows]);

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: ROW_HEIGHT,
    // Filter changes and refreshes can change row ordering; reset cached heights.
    key: `${graphState.response?.commits.length ?? 0}:${filterText
      .trim()
      .toLowerCase()}`,
  });

  function beginPaneSplitDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = panesWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const wrapperWidth = wrapper.clientWidth;
    if (!wrapperWidth) {
      return;
    }
    const handleWidth = event.currentTarget.getBoundingClientRect().width;
    const minLeft = GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX;
    const maxLeft = Math.max(
      minLeft,
      wrapperWidth - handleWidth - GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX,
    );

    if (event.detail === 2) {
      const nextPct = clamp(DEFAULT_GIT_GRAPH_SPLIT_PCT, 0, 100);
      overlayRef.current?.style.setProperty(
        CSS_VAR_GIT_GRAPH_SPLIT_PCT,
        nextPct.toString(),
      );
      useLocalStorage.setState({ gitGraphSplitPct: nextPct });
      return;
    }

    const startX = event.clientX;
    const startLeftPx =
      (wrapperWidth * clamp(splitPct, 0, 100)) / 100;
    const pointerId = event.pointerId;
    const root = overlayRef.current;
    if (!root) {
      return;
    }

    let rafId: number | null = null;
    const setPct = (pct: number) => {
      root.style.setProperty(CSS_VAR_GIT_GRAPH_SPLIT_PCT, pct.toString());
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const deltaX = moveEvent.clientX - startX;
      const nextLeftPx = clamp(startLeftPx + deltaX, minLeft, maxLeft);
      const nextPct = clamp((nextLeftPx / wrapperWidth) * 100, 0, 100);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        setPct(nextPct);
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const pctRaw = root.style.getPropertyValue(CSS_VAR_GIT_GRAPH_SPLIT_PCT);
      const pct = Number.parseFloat(pctRaw);
      const persisted = Number.isFinite(pct)
        ? clamp(pct, 0, 100)
        : DEFAULT_GIT_GRAPH_SPLIT_PCT;
      useLocalStorage.setState({ gitGraphSplitPct: persisted });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  function beginColumnResizeDrag(
    key: "graph" | "author" | "date" | "hash",
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const root = overlayRef.current;
    const header = commitHeaderRef.current;
    if (!root || !header) {
      return;
    }

    const headerStyle = window.getComputedStyle(header);
    const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
    const gridGap = Number.parseFloat(headerStyle.columnGap) || 0;
    const totalGapWidth = gridGap * 4;
    const contentWidth = Math.max(
      1,
      header.clientWidth - paddingLeft - paddingRight - totalGapWidth,
    );

    const cssVarByKey = {
      graph: CSS_VAR_GIT_GRAPH_COL_GRAPH,
      author: CSS_VAR_GIT_GRAPH_COL_AUTHOR,
      date: CSS_VAR_GIT_GRAPH_COL_DATE,
      hash: CSS_VAR_GIT_GRAPH_COL_HASH,
    } as const;
    const defaultPxByKey = {
      graph: 120,
      author: 120,
      date: 110,
      hash: 84,
    } as const;
    const minPxByKey = {
      graph: GRAPH_COL_MIN_WIDTH_PX,
      author: AUTHOR_COL_MIN_WIDTH_PX,
      date: DATE_COL_MIN_WIDTH_PX,
      hash: HASH_COL_MIN_WIDTH_PX,
    } as const;
    const maxPxByKey = {
      graph: GRAPH_COL_MAX_WIDTH_PX,
      author: AUTHOR_COL_MAX_WIDTH_PX,
      date: DATE_COL_MAX_WIDTH_PX,
      hash: HASH_COL_MAX_WIDTH_PX,
    } as const;

    const readCssPx = (cssVar: string, fallbackPx: number): number => {
      const raw = window.getComputedStyle(root).getPropertyValue(cssVar).trim();
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      return fallbackPx;
    };

    const graphPx = readCssPx(CSS_VAR_GIT_GRAPH_COL_GRAPH, graphColWidthPx);
    const authorPx = readCssPx(CSS_VAR_GIT_GRAPH_COL_AUTHOR, authorColWidthPx);
    const datePx = readCssPx(CSS_VAR_GIT_GRAPH_COL_DATE, dateColWidthPx);
    const hashPx = readCssPx(CSS_VAR_GIT_GRAPH_COL_HASH, hashColWidthPx);
    const currentByKey = { graph: graphPx, author: authorPx, date: datePx, hash: hashPx };

    const cssVar = cssVarByKey[key];
    const startWidth = currentByKey[key];
    const otherSum =
      graphPx + authorPx + datePx + hashPx - startWidth;
    const minPx = minPxByKey[key];
    const maxPxConstant = maxPxByKey[key];
    const maxFit = Math.max(minPx, contentWidth - otherSum);
    const maxPx = Math.min(maxPxConstant, maxFit);

    const applyWidth = (widthPx: number) => {
      root.style.setProperty(cssVar, `${widthPx}px`);
    };

    const persistWidth = (widthPx: number) => {
      if (key === "graph") {
        useLocalStorage.setState({ gitGraphColWidthPx: widthPx });
      } else if (key === "author") {
        useLocalStorage.setState({ gitGraphAuthorWidthPx: widthPx });
      } else if (key === "date") {
        useLocalStorage.setState({ gitGraphDateWidthPx: widthPx });
      } else {
        useLocalStorage.setState({ gitGraphHashWidthPx: widthPx });
      }
    };

    if (event.detail === 2) {
      const bounded = clamp(defaultPxByKey[key], minPx, maxPx);
      applyWidth(bounded);
      persistWidth(bounded);
      return;
    }

    const startX = event.clientX;
    const pointerId = event.pointerId;

    let rafId: number | null = null;

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const deltaX = moveEvent.clientX - startX;
      const next = clamp(startWidth + deltaX, minPx, maxPx);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        applyWidth(next);
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const raw = root.style.getPropertyValue(cssVar).trim();
      const parsed = Number.parseFloat(raw);
      const finalPx = Number.isFinite(parsed)
        ? clamp(parsed, minPx, maxPx)
        : clamp(defaultPxByKey[key], minPx, maxPx);
      applyWidth(finalPx);
      persistWidth(finalPx);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  return (
    <section
      ref={overlayRef}
      data-testid="git-graph-overlay"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border border-setta-200 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-950"
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

      <div ref={panesWrapperRef} className="flex min-h-0 flex-1">
        <section
          ref={historyPaneRef}
          data-testid="git-graph-history-pane"
          className="flex min-h-0 min-w-[320px] flex-col overflow-hidden"
          style={{
            width: `calc(var(${CSS_VAR_GIT_GRAPH_SPLIT_PCT}, ${DEFAULT_GIT_GRAPH_SPLIT_PCT}) * 1%)`,
          }}
        >
          <div
            ref={commitHeaderRef}
            className="grid gap-2 border-b border-setta-200/70 bg-setta-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:border-setta-800/70 dark:bg-setta-900 dark:text-setta-500"
            style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
          >
            <div
              data-testid="git-graph-header-graph"
              className="relative min-w-0 pr-2"
            >
              <span>Graph</span>
              <ColumnResizeHandle
                dataTestId="git-graph-col-resize-graph"
                label="Resize graph column"
                onPointerDown={(event) => beginColumnResizeDrag("graph", event)}
              />
            </div>
            <div data-testid="git-graph-header-message" className="min-w-0">
              Message
            </div>
            <div
              data-testid="git-graph-header-author"
              className="relative min-w-0 pr-2"
            >
              <span>Author</span>
              <ColumnResizeHandle
                dataTestId="git-graph-col-resize-author"
                label="Resize author column"
                onPointerDown={(event) => beginColumnResizeDrag("author", event)}
              />
            </div>
            <div
              data-testid="git-graph-header-date"
              className="relative min-w-0 pr-2"
            >
              <span>Date</span>
              <ColumnResizeHandle
                dataTestId="git-graph-col-resize-date"
                label="Resize date column"
                onPointerDown={(event) => beginColumnResizeDrag("date", event)}
              />
            </div>
            <div
              data-testid="git-graph-header-hash"
              className="relative min-w-0 pr-2"
            >
              <span>Hash</span>
              <ColumnResizeHandle
                dataTestId="git-graph-col-resize-hash"
                label="Resize hash column"
                onPointerDown={(event) => beginColumnResizeDrag("hash", event)}
              />
            </div>
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
                rowHeight={dynamicRowHeight}
                className="nodrag"
                rowProps={{
                  rows: filteredRows,
                  selectedHash: graphState.selectedCommitHash,
                  selectedCommitDetails: graphState.selectedCommitDetails,
                  selectedCommitDetailsIsLoading:
                    graphState.selectedCommitDetailsIsLoading,
                  selectedCommitDetailsError: graphState.selectedCommitDetailsError,
                  selectedFilePath: graphState.selectedCommitFilePath,
                  palette,
                  darkMode,
                  graphViewBoxWidth,
                  dynamicRowHeight,
                }}
                style={{ height: listSize.height, width: listSize.width }}
              />
            )}
          </div>
        </section>

        <div
          data-testid="git-graph-pane-splitter"
          role="separator"
          aria-label="Resize git graph panes"
          className="group/resize relative w-3 cursor-col-resize bg-transparent"
          onPointerDown={beginPaneSplitDrag}
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-200 dark:bg-setta-800 group-hover/resize:bg-blue-400 dark:group-hover/resize:bg-blue-400" />
        </div>

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
                      {DATE_FORMATTER.format(
                        new Date(selectedCommit.authorTimeMs),
                      )}{" "}
                      · {selectedCommit.hash.slice(0, 8)}
                    </div>
                    {graphState.selectedCommitFilePath && (
                      <div className="truncate font-mono text-[12px] text-setta-700 dark:text-setta-200">
                        {graphState.selectedCommitFilePath}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
                    onClick={() => void selectGitCommit(selectedCommit.hash)}
                  >
                    Reload
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

          {graphState.selectedCommitFileDiffResponse?.isTruncated && (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Diff output truncated for performance.
            </div>
          )}

          {graphState.selectedCommitFileDiffError && (
            <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {graphState.selectedCommitFileDiffError}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {graphState.selectedCommitFileDiffIsLoading ? (
              <div className="flex h-full min-h-0 items-center justify-center text-xs text-setta-500 dark:text-setta-300">
                Loading file diff…
              </div>
            ) : graphState.selectedCommitFileDiffResponse?.diff ? (
              <GitDiffCodeMirror
                value={graphState.selectedCommitFileDiffResponse.diff}
                filePathForLanguage={graphState.selectedCommitFilePath}
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
      </div>
    </section>
  );
}

type GitCommitRowProps = {
  index: number;
  style: Record<string, unknown>;
  rows: GitGraphRow[];
  selectedHash: string | null;
  selectedCommitDetails: GetGitCommitDetailsResponse | null;
  selectedCommitDetailsIsLoading: boolean;
  selectedCommitDetailsError: string | null;
  selectedFilePath: string | null;
  palette: readonly string[];
  darkMode: boolean;
  graphViewBoxWidth: number;
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
};

function GitCommitRow({
  index,
  style,
  rows,
  selectedHash,
  selectedCommitDetails,
  selectedCommitDetailsIsLoading,
  selectedCommitDetailsError,
  selectedFilePath,
  palette,
  darkMode,
  graphViewBoxWidth,
  dynamicRowHeight,
}: GitCommitRowProps) {
  const row = rows[index];
  if (!row) {
    return null;
  }
  const commit = row.commit;
  const isSelected = commit.hash === selectedHash;
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) {
      return;
    }
    return dynamicRowHeight.observeRowElements([el]);
  }, [dynamicRowHeight, index]);

  const date = DATE_FORMATTER.format(new Date(commit.authorTimeMs));
  const shortHash = commit.hash.slice(0, 8);
  const laneCount = row.laneColorIds.reduce(
    (count, colorId) => (colorId >= 0 ? count + 1 : count),
    0,
  );
  const rawCommitColorId = row.laneColorIds[row.laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);

  const allChips = commit.decorations
    .map(parseDecorationChip)
    .filter((chip): chip is DecorationChip => chip !== null)
    .sort(
      (a, b) =>
        DECORATION_KIND_PRIORITY[a.kind] - DECORATION_KIND_PRIORITY[b.kind],
    );
  const chips = allChips.slice(0, MAX_ROW_DECORATIONS);
  const extraChipCount = Math.max(0, allChips.length - chips.length);

  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "bg-transparent hover:bg-setta-50 dark:hover:bg-setta-900/60";

  return (
    <div
      style={style as never}
      ref={rowRef}
      data-react-window-index={index}
      className="w-full"
    >
      <button
        type="button"
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
            />
            <div className="col-span-4 min-w-0 py-3">
              {selectedCommitDetailsIsLoading ? (
                <div className="text-xs text-setta-500 dark:text-setta-300">
                  Loading commit details…
                </div>
              ) : selectedCommitDetailsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  {selectedCommitDetailsError}
                </div>
              ) : selectedCommitDetails &&
                selectedCommitDetails.commitHash === commit.hash ? (
                <ExpandedCommitRow
                  details={selectedCommitDetails}
                  selectedFilePath={selectedFilePath}
                />
              ) : (
                <div className="text-xs text-setta-500 dark:text-setta-300">
                  No details available.
                </div>
              )}
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
}: {
  laneColorIds: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  palette: readonly string[];
  darkMode: boolean;
  viewBoxWidth: number;
}) {
  const blockedLaneIndices = new Set<number>([
    ...laneEndIndices,
    ...joinFromLaneIndices,
  ]);
  const xForLane = (idx: number) => idx * LANE_WIDTH + LANE_WIDTH / 2;
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

function ExpandedCommitRow({
  details,
  selectedFilePath,
}: {
  details: GetGitCommitDetailsResponse;
  selectedFilePath: string | null;
}) {
  const parentsLabel = details.parents.map((p) => p.slice(0, 8)).join(" ");
  const authorDate = DATE_FORMATTER.format(new Date(details.authorTimeMs));
  const committerDate = DATE_FORMATTER.format(new Date(details.committerTimeMs));
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

          {showCommitter && (
            <>
              <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
                Committer
              </div>
              <div className="min-w-0 truncate text-setta-700 dark:text-setta-200">
                {details.committerName} · {committerDate}
              </div>
            </>
          )}
        </div>

        <div className="mt-2 min-w-0">
          <div className="text-xs font-semibold text-setta-900 dark:text-setta-50">
            {details.subject}
          </div>
          {details.body.trim() && (
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-setta-700 dark:text-setta-200">
              {details.body}
            </pre>
          )}
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
            className="max-h-56 overflow-x-hidden overflow-y-auto rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
          >
            {details.files.map((file) => (
              <li key={`${file.status}-${file.oldPath ?? ""}-${file.path}`}>
                <CommitFileRow
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

function CommitFileRow({
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

  return (
    <button
      type="button"
      className={`${base} ${background}`}
      onClick={() =>
        void selectGitCommitFile({
          path: file.path,
          oldPath: file.oldPath ?? null,
        })
      }
    >
      <span className="inline-flex w-10 shrink-0 items-center justify-center rounded-md bg-setta-100 px-1 py-0.5 font-mono text-[11px] font-semibold text-setta-600 dark:bg-setta-900 dark:text-setta-300">
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
  const idx = path.lastIndexOf("/");
  if (idx === -1) {
    return <span>{path}</span>;
  }
  const dir = path.slice(0, idx + 1);
  const base = path.slice(idx + 1);
  return (
    <>
      <span className="text-setta-400 dark:text-setta-500">{dir}</span>
      <span className="text-setta-800 dark:text-setta-100">{base}</span>
    </>
  );
}

function ColumnResizeHandle({
  dataTestId,
  label,
  onPointerDown,
}: {
  dataTestId: string;
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-testid={dataTestId}
      role="separator"
      aria-label={label}
      className="group/col-resize absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize"
      onPointerDown={onPointerDown}
    >
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-300 dark:bg-setta-700 group-hover/col-resize:bg-blue-400 dark:group-hover/col-resize:bg-blue-400" />
    </div>
  );
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

function DecorationPill({
  chip,
  laneColor,
}: {
  chip: DecorationChip;
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
        title={chip.label}
      >
        {chip.label}
      </span>
    );
  }
  return (
    <span
      className={`${base} border-setta-200 bg-white text-setta-700 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-200`}
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
}) {
  const height = ROW_HEIGHT;
  const width = Math.max(1, viewBoxWidth);
  const centerY = height / 2;
  // Keep strokes fully opaque so curves don't blend with underlying lanes and
  // appear to change color when crossing other branches.
  const strokeOpacity = 1;
  const xForLane = (idx: number) => idx * LANE_WIDTH + LANE_WIDTH / 2;

  const rawCommitColorId = laneColorIds[laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);

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
        let y1 = laneStartIndices.includes(idx) ? centerY : 0;
        let y2 = laneEndIndices.includes(idx) ? centerY : height;
        // Join curves occupy the top half of the row for the source lane;
        // drawing the vertical lane segment here creates a "tail" artifact.
        if (joinFromLaneIndices.includes(idx)) {
          y1 = Math.max(y1, centerY);
        }
        // For merge commits, the destination lane might already exist above this
        // row (e.g., when showing `--all` refs and that branch continues after
        // being merged). In that case we need to keep the lane continuous
        // through the row, otherwise it looks like the lane has a "gap".
        //
        // However, when the destination lane *starts* at this row, drawing a
        // vertical segment below the commit dot looks like a "tail" hanging off
        // the merge curve endpoint. Avoid that by suppressing the vertical
        // segment only for lanes that start at this row.
        if (
          mergeToLaneIndices.includes(idx) &&
          laneStartIndices.includes(idx)
        ) {
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
        // Use a cubic Bezier so the curve is tangent to the vertical lanes at
        // both ends (avoids a right-angle join at the commit dot).
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
        // Use a cubic Bezier so the curve is tangent to the vertical lanes at
        // both ends (avoids a right-angle turn at the commit dot).
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
