import type { GitreadCommit as Commit } from "openapi/http";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { useDynamicRowHeight, useListRef } from "react-window";

import { useLocalStorage } from "state/definitions";

import { useGitStore } from "state/git";

import type { GitGraphRow } from "utils/gitGraph";

import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";

import {
  AUTHOR_COL_MAX_WIDTH_PX,
  AUTHOR_COL_MIN_WIDTH_PX,
  DATE_COL_MAX_WIDTH_PX,
  DATE_COL_MIN_WIDTH_PX,
  GRAPH_COL_MAX_WIDTH_PX,
  GRAPH_COL_MIN_WIDTH_PX,
  HASH_COL_MAX_WIDTH_PX,
  HASH_COL_MIN_WIDTH_PX,
  MESSAGE_COL_MIN_WIDTH_PX,
  buildGitCommitSearchBlob,
  clampGitGraphPersistedWidths,
  collectRemoteDecorationPrefixes,
  computeGitGraphColumnDoubleClickPatch,
  computeGitGraphColumnWidthPatch,
  summarizeDecorationChips,
  type DecorationChipSummary,
  type GitGraphColumnBoundary,
  type GitGraphColumnWidthPatch,
  type GitGraphColumnWidths,
} from "../gitGraphOverlayUtils";

import { GitCommitRowDataProps } from "./overlayStateAndHistory";

export const ROW_HEIGHT = 28;

export const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const COMMIT_GRID_HORIZONTAL_PADDING_PX = 24;

// px-3 on both sides
const COMMIT_GRID_GAP_PX = 8;

// gap-2
const COMMIT_GRID_GAP_COUNT = 4;

export const GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX =
  GRAPH_COL_MIN_WIDTH_PX +
  AUTHOR_COL_MIN_WIDTH_PX +
  DATE_COL_MIN_WIDTH_PX +
  HASH_COL_MIN_WIDTH_PX +
  MESSAGE_COL_MIN_WIDTH_PX +
  COMMIT_GRID_HORIZONTAL_PADDING_PX +
  COMMIT_GRID_GAP_PX * COMMIT_GRID_GAP_COUNT;

export const GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX = 360;

export const CSS_VAR_GIT_GRAPH_SPLIT_PCT = "--git-graph-split-pct";

const CSS_VAR_GIT_GRAPH_COL_GRAPH = "--git-graph-col-graph";

const CSS_VAR_GIT_GRAPH_COL_AUTHOR = "--git-graph-col-author";

const CSS_VAR_GIT_GRAPH_COL_DATE = "--git-graph-col-date";

const CSS_VAR_GIT_GRAPH_COL_HASH = "--git-graph-col-hash";

export const COMMIT_GRID_TEMPLATE_COLUMNS = `var(${CSS_VAR_GIT_GRAPH_COL_GRAPH}, ${DEFAULT_GIT_GRAPH_COL_WIDTH_PX}px) minmax(${MESSAGE_COL_MIN_WIDTH_PX}px, 1fr) var(${CSS_VAR_GIT_GRAPH_COL_AUTHOR}, ${DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_DATE}, ${DEFAULT_GIT_GRAPH_DATE_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_HASH}, ${DEFAULT_GIT_GRAPH_HASH_WIDTH_PX}px)`;

export const LANE_COLORS_LIGHT = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#0ea5e9",
  "#ca8a04",
  "#0891b2",
];

export const LANE_COLORS_DARK = [
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

export function clampNonNegative(value: number): number {
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

export function laneColorForId(
  colorId: number,
  palette: readonly string[],
  darkMode: boolean,
): string {
  if (colorId < palette.length) {
    return palette[colorId] ?? palette[0] ?? "#000000";
  }
  return generatedLaneColor(colorId, darkMode);
}

export function buildDecorationChipSummaryByHash(
  commits: readonly Commit[],
): Map<string, DecorationChipSummary> {
  const allDecorations: string[] = [];
  for (const commit of commits) {
    allDecorations.push(...(commit.decorations ?? []));
  }
  const remoteDecorationPrefixes =
    collectRemoteDecorationPrefixes(allDecorations);

  const chipSummaryByHash = new Map<string, DecorationChipSummary>();
  for (const commit of commits) {
    chipSummaryByHash.set(
      commit.hash,
      summarizeDecorationChips(
        commit.decorations ?? [],
        remoteDecorationPrefixes,
      ),
    );
  }
  return chipSummaryByHash;
}

export type GitGraphOverlayState = NonNullable<
  ReturnType<typeof useGitStore.getState>["graph"]
>;

export type GitGraphOverlayProps = {
  embedded?: boolean;
  showCloseButton?: boolean;
  extraHeaderActions?: ReactNode;
  leftSidebar?: ReactNode;
};

export type GitGraphOverlayListSize = {
  height: number;
  width: number;
};

type GitGraphColumnKey = keyof GitGraphColumnWidths;

const GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY: Record<GitGraphColumnKey, string> = {
  graph: CSS_VAR_GIT_GRAPH_COL_GRAPH,
  author: CSS_VAR_GIT_GRAPH_COL_AUTHOR,
  date: CSS_VAR_GIT_GRAPH_COL_DATE,
  hash: CSS_VAR_GIT_GRAPH_COL_HASH,
};

type GitGraphDragRegistration = (cleanup: () => void) => () => void;

type GitGraphPersistRequest = (persist: () => void) => void;

export type GitGraphPaneSplitDragArgs = {
  overlayRef: RefObject<HTMLElement | null>;
  panesWrapperRef: RefObject<HTMLDivElement | null>;
  splitPct: number;
  registerDragCleanup: GitGraphDragRegistration;
  requestPersistIfConnected: GitGraphPersistRequest;
};

type GitGraphPaneSplitDragSession = {
  root: HTMLElement;
  wrapperWidth: number;
  minLeft: number;
  maxLeft: number;
  startX: number;
  startLeftPx: number;
  pointerId: number;
  latestPct: number;
};

export type GitGraphColumnResizeDragArgs = {
  overlayRef: RefObject<HTMLElement | null>;
  commitHeaderRef: RefObject<HTMLDivElement | null>;
  fallbackWidths: GitGraphColumnWidths;
  registerDragCleanup: GitGraphDragRegistration;
  requestPersistIfConnected: GitGraphPersistRequest;
  setLiveGraphColWidthPx: (value: number | null) => void;
};

type GitGraphColumnResizeDragSession = {
  boundary: GitGraphColumnBoundary;
  root: HTMLElement;
  contentWidth: number;
  start: GitGraphColumnWidths;
  pointerId: number;
  startX: number;
};

function readGitGraphHeaderContentWidth(header: HTMLDivElement): number {
  const headerStyle = window.getComputedStyle(header);
  const paddingLeft = Number.parseFloat(headerStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(headerStyle.paddingRight) || 0;
  const gridGap = Number.parseFloat(headerStyle.columnGap) || 0;
  const totalGapWidth = gridGap * 4;
  return Math.max(
    1,
    header.clientWidth - paddingLeft - paddingRight - totalGapWidth,
  );
}

function readGitGraphColumnWidth(
  root: HTMLElement,
  key: GitGraphColumnKey,
  fallbackWidth: number,
): number {
  const raw = window
    .getComputedStyle(root)
    .getPropertyValue(GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY[key])
    .trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackWidth;
}

function readGitGraphColumnWidths(
  root: HTMLElement,
  fallbackWidths: GitGraphColumnWidths,
): GitGraphColumnWidths {
  return {
    graph: readGitGraphColumnWidth(root, "graph", fallbackWidths.graph),
    author: readGitGraphColumnWidth(root, "author", fallbackWidths.author),
    date: readGitGraphColumnWidth(root, "date", fallbackWidths.date),
    hash: readGitGraphColumnWidth(root, "hash", fallbackWidths.hash),
  };
}

function applyGitGraphColumnWidths(
  root: HTMLElement,
  next: GitGraphColumnWidthPatch,
): void {
  if (next.graph !== undefined) {
    root.style.setProperty(
      GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY.graph,
      `${next.graph}px`,
    );
  }
  if (next.author !== undefined) {
    root.style.setProperty(
      GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY.author,
      `${next.author}px`,
    );
  }
  if (next.date !== undefined) {
    root.style.setProperty(
      GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY.date,
      `${next.date}px`,
    );
  }
  if (next.hash !== undefined) {
    root.style.setProperty(
      GIT_GRAPH_COLUMN_CSS_VAR_BY_KEY.hash,
      `${next.hash}px`,
    );
  }
}

function persistGitGraphColumnWidths(next: GitGraphColumnWidthPatch): void {
  const patch: Partial<{
    gitGraphColWidthPx: number;
    gitGraphAuthorWidthPx: number;
    gitGraphDateWidthPx: number;
    gitGraphHashWidthPx: number;
  }> = {};
  if (next.graph !== undefined) {
    patch.gitGraphColWidthPx = next.graph;
  }
  if (next.author !== undefined) {
    patch.gitGraphAuthorWidthPx = next.author;
  }
  if (next.date !== undefined) {
    patch.gitGraphDateWidthPx = next.date;
  }
  if (next.hash !== undefined) {
    patch.gitGraphHashWidthPx = next.hash;
  }
  if (Object.keys(patch).length > 0) {
    useLocalStorage.setState(patch);
  }
}

function createGitGraphPaneSplitDragSession(
  event: React.PointerEvent<HTMLDivElement>,
  {
    overlayRef,
    panesWrapperRef,
    splitPct,
  }: Pick<
    GitGraphPaneSplitDragArgs,
    "overlayRef" | "panesWrapperRef" | "splitPct"
  >,
): GitGraphPaneSplitDragSession | null {
  const root = overlayRef.current;
  const wrapper = panesWrapperRef.current;
  if (!root || !wrapper) {
    return null;
  }

  const wrapperWidth = wrapper.clientWidth;
  if (!wrapperWidth) {
    return null;
  }

  const handleWidth = event.currentTarget.getBoundingClientRect().width;
  const minLeft = GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX;
  const maxLeft = Math.max(
    minLeft,
    wrapperWidth - handleWidth - GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX,
  );
  return {
    root,
    wrapperWidth,
    minLeft,
    maxLeft,
    startX: event.clientX,
    startLeftPx: (wrapperWidth * clamp(splitPct, 0, 100)) / 100,
    pointerId: event.pointerId,
    latestPct: clamp(splitPct, 0, 100),
  };
}

function startGitGraphPaneSplitDrag(
  session: GitGraphPaneSplitDragSession,
  {
    registerDragCleanup,
    requestPersistIfConnected,
  }: Pick<
    GitGraphPaneSplitDragArgs,
    "registerDragCleanup" | "requestPersistIfConnected"
  >,
): void {
  let rafId: number | null = null;
  const setPct = (pct: number) => {
    session.root.style.setProperty(CSS_VAR_GIT_GRAPH_SPLIT_PCT, pct.toString());
  };

  const handleMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== session.pointerId) {
      return;
    }
    const deltaX = moveEvent.clientX - session.startX;
    const nextLeftPx = clamp(
      session.startLeftPx + deltaX,
      session.minLeft,
      session.maxLeft,
    );
    session.latestPct = clamp(
      (nextLeftPx / session.wrapperWidth) * 100,
      0,
      100,
    );
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      setPct(session.latestPct);
      rafId = null;
    });
  };

  const handleUp = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== session.pointerId) {
      return;
    }
    const persisted = clamp(session.latestPct, 0, 100);
    if (session.root.isConnected) {
      setPct(persisted);
    }
    teardownDrag();
    requestPersistIfConnected(() => {
      useLocalStorage.setState({ gitGraphSplitPct: persisted });
    });
  };

  const teardownDrag = registerDragCleanup(() => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleUp);
}

export function beginGitGraphPaneSplitDrag(
  event: React.PointerEvent<HTMLDivElement>,
  args: GitGraphPaneSplitDragArgs,
): void {
  event.preventDefault();
  event.stopPropagation();
  const session = createGitGraphPaneSplitDragSession(event, args);
  if (!session) {
    return;
  }

  if (event.detail === 2) {
    const nextPct = clamp(DEFAULT_GIT_GRAPH_SPLIT_PCT, 0, 100);
    session.root.style.setProperty(
      CSS_VAR_GIT_GRAPH_SPLIT_PCT,
      nextPct.toString(),
    );
    useLocalStorage.setState({ gitGraphSplitPct: nextPct });
    return;
  }

  startGitGraphPaneSplitDrag(session, args);
}

function createGitGraphColumnResizeDragSession(
  boundary: GitGraphColumnBoundary,
  event: React.PointerEvent<HTMLDivElement>,
  {
    overlayRef,
    commitHeaderRef,
    fallbackWidths,
  }: Pick<
    GitGraphColumnResizeDragArgs,
    "overlayRef" | "commitHeaderRef" | "fallbackWidths"
  >,
): GitGraphColumnResizeDragSession | null {
  const root = overlayRef.current;
  const header = commitHeaderRef.current;
  if (!root || !header) {
    return null;
  }

  return {
    boundary,
    root,
    contentWidth: readGitGraphHeaderContentWidth(header),
    start: readGitGraphColumnWidths(root, fallbackWidths),
    pointerId: event.pointerId,
    startX: event.clientX,
  };
}

function handleGitGraphColumnResizeDoubleClick(
  session: GitGraphColumnResizeDragSession,
  setLiveGraphColWidthPx: (value: number | null) => void,
): void {
  const next = computeGitGraphColumnDoubleClickPatch({
    boundary: session.boundary,
    start: session.start,
    contentWidth: session.contentWidth,
  });
  applyGitGraphColumnWidths(session.root, next);
  if (session.boundary === "graphMessage" && next.graph !== undefined) {
    setLiveGraphColWidthPx(next.graph);
  }
  persistGitGraphColumnWidths(next);
}

function startGitGraphColumnResizeDrag(
  session: GitGraphColumnResizeDragSession,
  {
    registerDragCleanup,
    requestPersistIfConnected,
    setLiveGraphColWidthPx,
  }: Pick<
    GitGraphColumnResizeDragArgs,
    | "registerDragCleanup"
    | "requestPersistIfConnected"
    | "setLiveGraphColWidthPx"
  >,
): void {
  let rafId: number | null = null;
  let latestWidths = { ...session.start };

  const handleMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== session.pointerId) {
      return;
    }
    const next = computeGitGraphColumnWidthPatch({
      boundary: session.boundary,
      deltaX: moveEvent.clientX - session.startX,
      start: session.start,
      contentWidth: session.contentWidth,
    });
    latestWidths = { ...latestWidths, ...next };
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      applyGitGraphColumnWidths(session.root, next);
      if (session.boundary === "graphMessage" && next.graph !== undefined) {
        setLiveGraphColWidthPx(next.graph);
      }
      rafId = null;
    });
  };

  const handleUp = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== session.pointerId) {
      return;
    }
    const persisted = clampGitGraphPersistedWidths(
      session.boundary,
      latestWidths,
    );
    if (session.root.isConnected) {
      if (session.boundary === "graphMessage") {
        setLiveGraphColWidthPx(persisted.graph ?? session.start.graph);
      }
      applyGitGraphColumnWidths(session.root, persisted);
    }
    teardownDrag();
    requestPersistIfConnected(() => {
      persistGitGraphColumnWidths(persisted);
    });
  };

  const teardownDrag = registerDragCleanup(() => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleUp);
}

export function beginGitGraphColumnResizeDrag(
  boundary: GitGraphColumnBoundary,
  event: React.PointerEvent<HTMLDivElement>,
  args: GitGraphColumnResizeDragArgs,
): void {
  event.preventDefault();
  event.stopPropagation();
  const session = createGitGraphColumnResizeDragSession(boundary, event, args);
  if (!session) {
    return;
  }

  if (event.detail === 2) {
    handleGitGraphColumnResizeDoubleClick(session, args.setLiveGraphColWidthPx);
    return;
  }

  startGitGraphColumnResizeDrag(session, args);
}

export function buildGitGraphCommitSearchBlobByHash(
  commits: readonly Commit[],
): Map<string, string> {
  const byHash = new Map<string, string>();
  for (const commit of commits) {
    byHash.set(commit.hash, buildGitCommitSearchBlob(commit));
  }
  return byHash;
}

export function buildFilteredGitGraphRows(
  rows: GitGraphRow[],
  filterText: string,
  commitSearchBlobByHash: ReadonlyMap<string, string>,
): GitGraphRow[] {
  const query = filterText.trim().toLowerCase();
  if (!query) {
    return rows;
  }
  return rows.filter((row) => {
    const blob =
      commitSearchBlobByHash.get(row.commit.hash) ??
      buildGitCommitSearchBlob(row.commit);
    return blob.includes(query);
  });
}

export function calculateGitGraphMaxLaneCount(
  rows: readonly GitGraphRow[],
): number {
  return rows.reduce(
    (maxCount, row) => Math.max(maxCount, row.laneColorIds.length),
    1,
  );
}

export function getSelectedGitGraphCommit(
  selectedCommitHash: string | null,
  commitsByHash: ReadonlyMap<string, Commit>,
): Commit | null {
  if (!selectedCommitHash) {
    return null;
  }
  return commitsByHash.get(selectedCommitHash) ?? null;
}

export function useGitGraphOverlayStorage() {
  return useLocalStorage((state) => ({
    darkMode: state.darkMode,
    splitPct: state.gitGraphSplitPct,
    graphColWidthPx: state.gitGraphColWidthPx,
    authorColWidthPx: state.gitGraphAuthorWidthPx,
    dateColWidthPx: state.gitGraphDateWidthPx,
    hashColWidthPx: state.gitGraphHashWidthPx,
  }));
}

export function useGitGraphDragCleanupRegistry(): GitGraphDragRegistration {
  const activeDragCleanupsRef = useRef(new Set<() => void>());

  useEffect(() => {
    return () => {
      const pendingCleanups = Array.from(activeDragCleanupsRef.current);
      activeDragCleanupsRef.current.clear();
      for (const cleanup of pendingCleanups) {
        cleanup();
      }
    };
  }, []);

  return (cleanup) => {
    let isCleanedUp = false;
    const wrappedCleanup = () => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;
      activeDragCleanupsRef.current.delete(wrappedCleanup);
      cleanup();
    };
    activeDragCleanupsRef.current.add(wrappedCleanup);
    return wrappedCleanup;
  };
}

export function createGitGraphPersistRequest(
  overlayRef: RefObject<HTMLElement | null>,
): GitGraphPersistRequest {
  return (persist) => {
    requestAnimationFrame(() => {
      const root = overlayRef.current;
      if (!root?.isConnected) {
        return;
      }
      persist();
    });
  };
}

export function useGitGraphListSize(
  listWrapperRef: RefObject<HTMLDivElement | null>,
): GitGraphOverlayListSize {
  const [listSize, setListSize] = useState<GitGraphOverlayListSize>({
    height: 320,
    width: 320,
  });

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
  }, [listWrapperRef]);

  return listSize;
}

export function useGitGraphLiveGraphColumnWidth(
  graphColWidthPx: number,
): [number | null, (value: number | null) => void] {
  const [liveGraphColWidthPx, setLiveGraphColWidthPx] = useState<number | null>(
    null,
  );

  useEffect(() => {
    setLiveGraphColWidthPx(null);
  }, [graphColWidthPx]);

  return [liveGraphColWidthPx, setLiveGraphColWidthPx];
}

export function useGitGraphOverlayStyleSync({
  overlayRef,
  splitPct,
  graphColWidthPx,
  authorColWidthPx,
  dateColWidthPx,
  hashColWidthPx,
}: {
  overlayRef: RefObject<HTMLElement | null>;
  splitPct: number;
  graphColWidthPx: number;
  authorColWidthPx: number;
  dateColWidthPx: number;
  hashColWidthPx: number;
}): void {
  useEffect(() => {
    const root = overlayRef.current;
    if (!root) {
      return;
    }
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_SPLIT_PCT,
      clamp(splitPct, 0, 100).toString(),
    );
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_GRAPH,
      `${clamp(
        graphColWidthPx,
        GRAPH_COL_MIN_WIDTH_PX,
        GRAPH_COL_MAX_WIDTH_PX,
      )}px`,
    );
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_AUTHOR,
      `${clamp(
        authorColWidthPx,
        AUTHOR_COL_MIN_WIDTH_PX,
        AUTHOR_COL_MAX_WIDTH_PX,
      )}px`,
    );
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_DATE,
      `${clamp(
        dateColWidthPx,
        DATE_COL_MIN_WIDTH_PX,
        DATE_COL_MAX_WIDTH_PX,
      )}px`,
    );
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_COL_HASH,
      `${clamp(hashColWidthPx, HASH_COL_MIN_WIDTH_PX, HASH_COL_MAX_WIDTH_PX)}px`,
    );
  }, [
    overlayRef,
    authorColWidthPx,
    dateColWidthPx,
    graphColWidthPx,
    hashColWidthPx,
    splitPct,
  ]);
}

export type GitGraphOverlayModel = {
  graphState: GitGraphOverlayState;
  repoRoot: string | null;
  headBranch: string | null;
  filterText: string;
  allRefs: boolean;
  overlayRef: RefObject<HTMLElement | null>;
  panesWrapperRef: RefObject<HTMLDivElement | null>;
  commitHeaderRef: RefObject<HTMLDivElement | null>;
  listWrapperRef: RefObject<HTMLDivElement | null>;
  listRef: ReturnType<typeof useListRef>;
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
  commitRowProps: GitCommitRowDataProps;
  listSize: GitGraphOverlayListSize;
  isFilterActive: boolean;
  loadedCommitCount: number;
  selectedCommit: Commit | null;
  paneSplitDragArgs: GitGraphPaneSplitDragArgs;
  columnResizeDragArgs: GitGraphColumnResizeDragArgs;
};

export type GitGraphOverlayStateSlice = {
  rows: GitGraphRow[];
  commits: Commit[];
  filterText: string;
  selectedHash: string | null;
  allRefs: boolean;
  repoRoot: string | null;
  headBranch: string | null;
};

export type GitGraphOverlayComputedData = {
  dynamicRowHeight: ReturnType<typeof useDynamicRowHeight>;
  commitRowProps: GitCommitRowDataProps;
  selectedCommit: Commit | null;
  isFilterActive: boolean;
  loadedCommitCount: number;
};
