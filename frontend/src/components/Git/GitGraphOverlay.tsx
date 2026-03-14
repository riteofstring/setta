import { GitDiffCodeMirror } from "components/Git/GitDiffCodeMirror";
import {
  gitFileStatusCategoryFromCommitFile,
  gitFileStatusVisuals,
} from "components/Git/gitFileStatusVisuals";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  List,
  useDynamicRowHeight,
  useListRef,
  type RowComponentProps,
} from "react-window";
import {
  loadMoreGitGraphCommits,
  refreshGitGraphOverlay,
  setGitGraphFilterText,
  toggleGitGraphAllRefs,
} from "state/actions/gitGraphLog";
import {
  clearGitGraphSelectedCommit,
  selectGitCommit,
  selectGitCommitFile,
} from "state/actions/gitGraphSelection";
import { closeGitOverlay } from "state/actions/gitStatusAndDiff";
import { useGitStore } from "state/git";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import type {
  GetGitCommitDetailsResponse,
  GitCommit,
  GitCommitChangedFile,
} from "utils/generatedTypes";
import type { GitGraphRow } from "utils/gitGraph";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";

const ROW_HEIGHT = 28;
const MAX_ROW_DECORATIONS = 3;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const COMMIT_GRID_HORIZONTAL_PADDING_PX = 24; // px-3 on both sides
const COMMIT_GRID_GAP_PX = 8; // gap-2
const COMMIT_GRID_GAP_COUNT = 4;
const MESSAGE_COL_MIN_WIDTH_PX = 96;

const GRAPH_COL_MIN_WIDTH_PX = 80;
const GRAPH_COL_MAX_WIDTH_PX = 240;
const AUTHOR_COL_MIN_WIDTH_PX = 90;
const AUTHOR_COL_MAX_WIDTH_PX = 260;
const DATE_COL_MIN_WIDTH_PX = 90;
const DATE_COL_MAX_WIDTH_PX = 220;
const HASH_COL_MIN_WIDTH_PX = 70;
const HASH_COL_MAX_WIDTH_PX = 160;

const GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX =
  GRAPH_COL_MIN_WIDTH_PX +
  AUTHOR_COL_MIN_WIDTH_PX +
  DATE_COL_MIN_WIDTH_PX +
  HASH_COL_MIN_WIDTH_PX +
  MESSAGE_COL_MIN_WIDTH_PX +
  COMMIT_GRID_HORIZONTAL_PADDING_PX +
  COMMIT_GRID_GAP_PX * COMMIT_GRID_GAP_COUNT;
const GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX = 360;

const CSS_VAR_GIT_GRAPH_SPLIT_PCT = "--git-graph-split-pct";
const CSS_VAR_GIT_GRAPH_COL_GRAPH = "--git-graph-col-graph";
const CSS_VAR_GIT_GRAPH_COL_AUTHOR = "--git-graph-col-author";
const CSS_VAR_GIT_GRAPH_COL_DATE = "--git-graph-col-date";
const CSS_VAR_GIT_GRAPH_COL_HASH = "--git-graph-col-hash";

const COMMIT_GRID_TEMPLATE_COLUMNS = `var(${CSS_VAR_GIT_GRAPH_COL_GRAPH}, ${DEFAULT_GIT_GRAPH_COL_WIDTH_PX}px) minmax(${MESSAGE_COL_MIN_WIDTH_PX}px, 1fr) var(${CSS_VAR_GIT_GRAPH_COL_AUTHOR}, ${DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_DATE}, ${DEFAULT_GIT_GRAPH_DATE_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_HASH}, ${DEFAULT_GIT_GRAPH_HASH_WIDTH_PX}px)`;

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
const LOAD_MORE_THRESHOLD_ROWS = 40;

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

type DecorationChipSummary = {
  chips: DecorationChip[];
  extraChipCount: number;
};

const DECORATION_KIND_PRIORITY: Record<DecorationKind, number> = {
  head: 0,
  branch: 1,
  remote: 2,
  tag: 3,
  symbolic: 4,
  other: 5,
};
const EMPTY_REMOTE_DECORATION_PREFIXES: ReadonlySet<string> = new Set();

export function buildGitCommitSearchBlob(commit: GitCommit): string {
  const normalizedDecorations = commit.decorations.join(" ").toLowerCase();
  return `${commit.hash} ${commit.subject} ${commit.authorName} ${normalizedDecorations}`.toLowerCase();
}

export function collectRemoteDecorationPrefixes(
  decorations: readonly string[],
): Set<string> {
  const remotePrefixes = new Set<string>();

  for (const raw of decorations) {
    const text = raw.trim();
    if (!text || text.startsWith("tag: ")) {
      continue;
    }

    if (text.startsWith("origin/")) {
      remotePrefixes.add("origin");
      continue;
    }
    if (text.startsWith("upstream/")) {
      remotePrefixes.add("upstream");
      continue;
    }

    const arrowIdx = text.indexOf(" -> ");
    if (arrowIdx === -1) {
      continue;
    }
    const left = text.slice(0, arrowIdx).trim();
    const right = text.slice(arrowIdx + " -> ".length).trim();
    if (!left.endsWith("/HEAD")) {
      continue;
    }
    const prefix = left.slice(0, -"/HEAD".length).trim();
    if (!prefix) {
      continue;
    }
    if (right.startsWith(`${prefix}/`)) {
      remotePrefixes.add(prefix);
    }
  }

  return remotePrefixes;
}

function parseDecorationChip(
  raw: string,
  remoteDecorationPrefixes: ReadonlySet<string>,
): DecorationChip | null {
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
  const slashIdx = text.indexOf("/");
  if (slashIdx > 0) {
    const prefix = text.slice(0, slashIdx);
    if (remoteDecorationPrefixes.has(prefix)) {
      return { label: text, kind: "remote" };
    }
  }
  if (text.startsWith("origin/") || text.startsWith("upstream/")) {
    return { label: text, kind: "remote" };
  }
  return { label: text, kind: "branch" };
}

export function summarizeDecorationChips(
  decorations: readonly string[],
  remoteDecorationPrefixes: ReadonlySet<string> = EMPTY_REMOTE_DECORATION_PREFIXES,
): DecorationChipSummary {
  const allChips = decorations
    .map((decoration) =>
      parseDecorationChip(decoration, remoteDecorationPrefixes),
    )
    .filter((chip): chip is DecorationChip => chip !== null)
    .sort(
      (a, b) =>
        DECORATION_KIND_PRIORITY[a.kind] - DECORATION_KIND_PRIORITY[b.kind],
    );
  const chips = allChips.slice(0, MAX_ROW_DECORATIONS);
  return {
    chips,
    extraChipCount: Math.max(0, allChips.length - chips.length),
  };
}

function buildDecorationChipSummaryByHash(
  commits: readonly GitCommit[],
): Map<string, DecorationChipSummary> {
  const allDecorations: string[] = [];
  for (const commit of commits) {
    allDecorations.push(...commit.decorations);
  }
  const remoteDecorationPrefixes =
    collectRemoteDecorationPrefixes(allDecorations);

  const chipSummaryByHash = new Map<string, DecorationChipSummary>();
  for (const commit of commits) {
    chipSummaryByHash.set(
      commit.hash,
      summarizeDecorationChips(commit.decorations, remoteDecorationPrefixes),
    );
  }
  return chipSummaryByHash;
}

export function buildGitCommitLookupByHash(
  commits: readonly GitCommit[],
): Map<string, GitCommit> {
  const commitsByHash = new Map<string, GitCommit>();
  for (const commit of commits) {
    commitsByHash.set(commit.hash, commit);
  }
  return commitsByHash;
}

export function buildGitGraphRowHeightCacheKey({
  commitDigest,
  allRefs,
  filterText,
}: {
  commitDigest: string;
  allRefs: boolean;
  filterText: string;
}): string {
  const normalizedFilter = filterText.trim().toLowerCase();
  const refMode = allRefs ? "all" : "branch";
  return `${commitDigest}:${refMode}:${normalizedFilter}`;
}

export function buildGitGraphCommitDigest(
  commits: readonly GitCommit[],
): string {
  if (commits.length === 0) {
    return "0";
  }
  let digest = 2166136261;
  for (const commit of commits) {
    for (let idx = 0; idx < commit.hash.length; idx += 1) {
      digest ^= commit.hash.charCodeAt(idx);
      digest = Math.imul(digest, 16777619) >>> 0;
    }
    digest ^= 124;
    digest = Math.imul(digest, 16777619) >>> 0;
  }
  return `${commits.length}:${digest.toString(16)}`;
}

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

  const listRef = useListRef(null);
  const overlayRef = useRef<HTMLElement | null>(null);
  const panesWrapperRef = useRef<HTMLDivElement | null>(null);
  const commitHeaderRef = useRef<HTMLDivElement | null>(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const activeDragCleanupsRef = useRef(new Set<() => void>());
  const [listSize, setListSize] = useState({ height: 320, width: 320 });
  const [liveGraphColWidthPx, setLiveGraphColWidthPx] = useState<number | null>(
    null,
  );

  function registerDragCleanup(cleanup: () => void): () => void {
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
  }

  function requestPersistIfConnected(persist: () => void): void {
    requestAnimationFrame(() => {
      const root = overlayRef.current;
      if (!root?.isConnected) {
        return;
      }
      persist();
    });
  }

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

  useEffect(() => {
    // When persisted width changes, drop any temporary drag-time override.
    setLiveGraphColWidthPx(null);
  }, [graphColWidthPx]);

  useEffect(() => {
    return () => {
      const pendingCleanups = Array.from(activeDragCleanupsRef.current);
      activeDragCleanupsRef.current.clear();
      for (const cleanup of pendingCleanups) {
        cleanup();
      }
    };
  }, []);

  const rows = graphState?.rows ?? [];
  const commits = graphState?.response?.commits ?? [];
  const filterText = graphState?.filterText ?? "";
  const commitsByHash = useMemo(() => {
    return buildGitCommitLookupByHash(commits);
  }, [commits]);
  const commitSearchBlobByHash = useMemo(() => {
    const byHash = new Map<string, string>();
    for (const commit of commits) {
      byHash.set(commit.hash, buildGitCommitSearchBlob(commit));
    }
    return byHash;
  }, [commits]);
  const selectedCommit = graphState?.selectedCommitHash
    ? commitsByHash.get(graphState.selectedCommitHash) ?? null
    : null;
  const commitDigest = useMemo(() => {
    return buildGitGraphCommitDigest(commits);
  }, [commits]);
  const dynamicRowHeightCacheKey = useMemo(() => {
    return buildGitGraphRowHeightCacheKey({
      commitDigest,
      allRefs: graphState?.allRefs ?? false,
      filterText,
    });
  }, [commitDigest, filterText, graphState?.allRefs]);
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: ROW_HEIGHT,
    key: dynamicRowHeightCacheKey,
  });

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
  }, [commitSearchBlobByHash, rows, filterText]);
  const decorationChipSummaryByHash = useMemo(() => {
    return buildDecorationChipSummaryByHash(commits);
  }, [commits]);

  const maxLaneCount = useMemo(() => {
    return rows.reduce(
      (maxCount, row) => Math.max(maxCount, row.laneColorIds.length),
      1,
    );
  }, [rows]);
  const graphViewBoxWidth = useMemo(() => {
    // Keep the SVG coordinate width synchronized with the rendered graph
    // column width so lane geometry does not scale non-uniformly.
    return Math.max(1, liveGraphColWidthPx ?? graphColWidthPx);
  }, [graphColWidthPx, liveGraphColWidthPx]);
  const laneWidth = useMemo(() => {
    return graphViewBoxWidth / Math.max(1, maxLaneCount);
  }, [graphViewBoxWidth, maxLaneCount]);
  const palette = darkMode ? LANE_COLORS_DARK : LANE_COLORS_LIGHT;
  const commitRowProps = useMemo<GitCommitRowDataProps>(
    () => ({
      rows: filteredRows,
      selectedHash: graphState?.selectedCommitHash ?? null,
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
      graphState?.selectedCommitHash,
      graphViewBoxWidth,
      laneWidth,
      palette,
    ],
  );

  if (!graphState) {
    return null;
  }

  const repoRoot = graphState.response?.repoRoot ?? null;
  const headBranch = graphState.response?.headBranch ?? null;

  const isFilterActive = filterText.trim().length > 0;
  const loadedCommitCount = commits.length;

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
    const startLeftPx = (wrapperWidth * clamp(splitPct, 0, 100)) / 100;
    const pointerId = event.pointerId;
    const root = overlayRef.current;
    if (!root) {
      return;
    }

    let rafId: number | null = null;
    let latestPct = clamp(splitPct, 0, 100);
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
      latestPct = nextPct;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        setPct(latestPct);
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      const persisted = clamp(latestPct, 0, 100);
      if (root.isConnected) {
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

  function beginColumnResizeDrag(
    boundary: "graphMessage" | "messageAuthor" | "authorDate" | "dateHash",
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
      graph: DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
      author: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
      date: DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
      hash: DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
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
    const start = {
      graph: graphPx,
      author: authorPx,
      date: datePx,
      hash: hashPx,
    };

    const applyWidths = (next: Partial<typeof start>) => {
      if (next.graph !== undefined) {
        root.style.setProperty(cssVarByKey.graph, `${next.graph}px`);
      }
      if (next.author !== undefined) {
        root.style.setProperty(cssVarByKey.author, `${next.author}px`);
      }
      if (next.date !== undefined) {
        root.style.setProperty(cssVarByKey.date, `${next.date}px`);
      }
      if (next.hash !== undefined) {
        root.style.setProperty(cssVarByKey.hash, `${next.hash}px`);
      }
    };

    const persistWidths = (next: Partial<typeof start>) => {
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
    };

    const clampSingleWidth = (
      key: keyof typeof start,
      requestedWidth: number,
    ): number => {
      const minPx = minPxByKey[key];
      const maxPxConstant = maxPxByKey[key];
      const otherSum =
        start.graph + start.author + start.date + start.hash - start[key];
      const maxFit = Math.max(
        minPx,
        contentWidth - otherSum - MESSAGE_COL_MIN_WIDTH_PX,
      );
      const maxPx = Math.min(maxPxConstant, maxFit);
      return clamp(requestedWidth, minPx, maxPx);
    };

    const clampAuthorDateDelta = (delta: number): number => {
      const lower = Math.max(
        minPxByKey.author - start.author,
        start.date - maxPxByKey.date,
      );
      const upper = Math.min(
        maxPxByKey.author - start.author,
        start.date - minPxByKey.date,
      );
      if (lower > upper) {
        return 0;
      }
      return clamp(delta, lower, upper);
    };

    const clampDateHashDelta = (delta: number): number => {
      const lower = Math.max(
        minPxByKey.date - start.date,
        start.hash - maxPxByKey.hash,
      );
      const upper = Math.min(
        maxPxByKey.date - start.date,
        start.hash - minPxByKey.hash,
      );
      if (lower > upper) {
        return 0;
      }
      return clamp(delta, lower, upper);
    };

    const computeNextFromDelta = (deltaX: number): Partial<typeof start> => {
      if (boundary === "graphMessage") {
        return {
          graph: clampSingleWidth("graph", start.graph + deltaX),
        };
      }
      if (boundary === "messageAuthor") {
        return {
          author: clampSingleWidth("author", start.author - deltaX),
        };
      }
      if (boundary === "authorDate") {
        const clampedDelta = clampAuthorDateDelta(deltaX);
        return {
          author: start.author + clampedDelta,
          date: start.date - clampedDelta,
        };
      }
      const clampedDelta = clampDateHashDelta(deltaX);
      return {
        date: start.date + clampedDelta,
        hash: start.hash - clampedDelta,
      };
    };

    const changedKeysByBoundary = {
      graphMessage: ["graph"],
      messageAuthor: ["author"],
      authorDate: ["author", "date"],
      dateHash: ["date", "hash"],
    } as const;

    if (event.detail === 2) {
      if (boundary === "graphMessage") {
        const next = {
          graph: clampSingleWidth("graph", defaultPxByKey.graph),
        };
        applyWidths(next);
        setLiveGraphColWidthPx(next.graph);
        persistWidths(next);
      } else if (boundary === "messageAuthor") {
        const next = {
          author: clampSingleWidth("author", defaultPxByKey.author),
        };
        applyWidths(next);
        persistWidths(next);
      } else if (boundary === "authorDate") {
        const targetDelta = defaultPxByKey.author - start.author;
        const clampedDelta = clampAuthorDateDelta(targetDelta);
        const next = {
          author: start.author + clampedDelta,
          date: start.date - clampedDelta,
        };
        applyWidths(next);
        persistWidths(next);
      } else {
        const targetDelta = defaultPxByKey.date - start.date;
        const clampedDelta = clampDateHashDelta(targetDelta);
        const next = {
          date: start.date + clampedDelta,
          hash: start.hash - clampedDelta,
        };
        applyWidths(next);
        persistWidths(next);
      }
      return;
    }

    const startX = event.clientX;
    const pointerId = event.pointerId;

    let rafId: number | null = null;
    let latestWidths = { ...start };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const deltaX = moveEvent.clientX - startX;
      const next = computeNextFromDelta(deltaX);
      latestWidths = { ...latestWidths, ...next };
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        applyWidths(next);
        if (boundary === "graphMessage" && next.graph !== undefined) {
          setLiveGraphColWidthPx(next.graph);
        }
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      const keys = changedKeysByBoundary[boundary];
      const persisted: Partial<typeof start> = {};
      for (const key of keys) {
        const value = latestWidths[key];
        const minPx = minPxByKey[key];
        const maxPx = maxPxByKey[key];
        persisted[key] = clamp(value, minPx, maxPx);
      }
      if (root.isConnected) {
        if (boundary === "graphMessage") {
          setLiveGraphColWidthPx(persisted.graph ?? start.graph);
        }
        applyWidths(persisted);
      }
      teardownDrag();
      requestPersistIfConnected(() => {
        persistWidths(persisted);
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
                      graphState.isLoading ||
                      graphState.isLoadingMore ||
                      graphState.loadMoreError !== null ||
                      graphState.nextOffset === null ||
                      !graphState.hasMore ||
                      isFilterActive
                    ) {
                      return;
                    }
                    const remaining =
                      filteredRows.length - 1 - visibleRows.stopIndex;
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
            {!graphState.isLoading && (
              <div
                data-testid="git-graph-load-more-status"
                className="min-h-[24px] border-t border-setta-200/70 px-3 py-1 text-[11px] text-setta-500 dark:border-setta-800/70 dark:text-setta-400"
              >
                {graphState.loadMoreError ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{graphState.loadMoreError}</span>
                    <button
                      type="button"
                      data-testid="git-graph-load-more-retry"
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-setta-600 hover:bg-setta-100 hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-300 dark:hover:bg-setta-800/60 dark:hover:text-setta-50"
                      onClick={() =>
                        void loadMoreGitGraphCommits({ force: true })
                      }
                    >
                      Retry
                    </button>
                  </div>
                ) : graphState.isLoadingMore ? (
                  <span>Loading more commits…</span>
                ) : isFilterActive ? (
                  <span>Filtering loaded commits only.</span>
                ) : loadedCommitCount === 0 && !graphState.error ? (
                  <span>No commits yet on this ref.</span>
                ) : graphState.isCapped ? (
                  <span>
                    Showing first {loadedCommitCount.toLocaleString()} commits
                    (cap reached).
                  </span>
                ) : !graphState.hasMore && loadedCommitCount > 0 ? (
                  <span>Start of history reached.</span>
                ) : (
                  <span className="opacity-0">.</span>
                )}
              </div>
            )}
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

            {selectedCommit &&
              graphState.selectedCommitFileDiffResponse?.isTruncated && (
                <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Diff output truncated for performance.
                </div>
              )}

            {selectedCommit &&
              graphState.selectedCommitDetails?.isTruncated && (
                <div
                  data-testid="git-graph-commit-details-truncated-warning"
                  className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  Commit details were truncated. The changed-file list may be
                  incomplete.
                </div>
              )}

            {selectedCommit && graphState.selectedCommitFileDiffError && (
              <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                {graphState.selectedCommitFileDiffError}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              {!selectedCommit ? (
                <div className="flex h-full min-h-0 items-center justify-center px-6 text-xs text-setta-500 dark:text-setta-300">
                  Select a commit to view details.
                </div>
              ) : graphState.selectedCommitFileDiffIsLoading ? (
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
      </div>
    </section>
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
  decorationChipSummaryByHash: Map<string, DecorationChipSummary>;
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
              <SelectedCommitDetails commitHash={commit.hash} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedCommitDetails({ commitHash }: { commitHash: string }) {
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
      <ExpandedCommitRow
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

function ExpandedCommitRow({
  details,
  selectedFilePath,
}: {
  details: GetGitCommitDetailsResponse;
  selectedFilePath: string | null;
}) {
  const parentsLabel = details.parents.map((p) => p.slice(0, 8)).join(" ");
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
            className="max-h-56 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
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
  edge,
  onPointerDown,
}: {
  dataTestId: string;
  label: string;
  edge: "left" | "right";
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
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
        // Join curves occupy the top half of the row for the source lane;
        // drawing the vertical lane segment here creates a "tail" artifact.
        if (joinFromSet.has(idx)) {
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
